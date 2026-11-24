import { afterEach, describe, expect, it } from "vitest";
import { all, get, run } from "@/lib/db";
import { balanceOf, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import {
  DISCLOSURES,
  executeSip,
  getSeries,
  latestPrice,
  priceProvider,
  scoreAnswers,
  setPriceProvider,
  sipNeedsMpin,
  yahooProvider,
} from "@/lib/invest";
import { POST as sipRoute, DELETE as pauseSipRoute } from "@/app/api/v1/invest/core/sip/route";
import { POST as optInRoute } from "@/app/api/v1/invest/satellite/opt-in/route";
import { POST as runRoute } from "@/app/api/v1/invest/satellite/run/route";
import { downPrices, fakePrices } from "./helpers/prices";

/* ---------- Helpers ---------- */

const DAY = 86_400_000;
const PIN = "482915";
const WRONG = "739204";

function req(path: string, opts: { method?: string; body?: unknown } = {}) {
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : {},
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const call = (h: unknown, request?: Request) => (h as (...a: unknown[]) => Promise<Response>)(request);

// Prototype mode: the first user is the customer every route acts for.
const main = createUser({ name: "Ivy Investor", jurisdiction: "US", pin: PIN, createdAt: Date.now() - DAY });
const me = () => get<User>("SELECT * FROM users WHERE id = ?", main.id)!;
transfer({ userId: main.id, from: worldAccount("USD").id, to: userAccount(main.id, "bank", "USD").id, amount: 10_000_00, kind: "income", memo: "seed" });
const profile = scoreAnswers({ age: 0, horizon: 3, income: 3, cushion: 3, drawdown: 3, experience: 3, goal: 3 });
run("UPDATE users SET risk_profile = ? WHERE id = ?", JSON.stringify({ ...profile, completedAt: Date.now() }), main.id);

const bank = () => balanceOf(userAccount(main.id, "bank", "USD").id);
const journals = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM journals WHERE user_id = ?", main.id)!.n;
const sip = () => get<{ amount: number; frequency: string; next_run_at: number }>("SELECT * FROM sip_plans WHERE user_id = ? AND active = 1", main.id);
const saveSip = (body: Record<string, unknown>) => call(sipRoute, req("/api/v1/invest/core/sip", { body }));

afterEach(() => {
  setPriceProvider(fakePrices());
  // The MPIN module makes its table on first use.
  if (get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mpin_attempts'")) run("DELETE FROM mpin_attempts WHERE user_id = ?", main.id);
});

/* ---------- Price provider (B21) ---------- */

describe("price provider", () => {
  it("defaults to Yahoo, and the test setup swaps in a fake so nothing reaches the network", async () => {
    setPriceProvider(null);
    expect(priceProvider()).toBe(yahooProvider);
    setPriceProvider(fakePrices());
    expect(priceProvider().source).toBe("fake");
    await expect(fetch("https://query1.finance.yahoo.com/v8/finance/chart/SPY")).rejects.toThrow(/no network/);
  });

  it("serves live reads from the provider, then from the cache", async () => {
    const prices = fakePrices({ prices: { "PROV-A": 42 } });
    setPriceProvider(prices);
    const live = await getSeries("PROV-A", "1d", "1mo");
    expect(live).toMatchObject({ source: "fake", currency: "USD" });
    expect(live.candles.at(-1)!.c).toBe(42);
    expect((await getSeries("PROV-A", "1d", "1mo")).source).toBe("cache");
    expect(prices.calls).toEqual(["PROV-A|1d|1mo"]);
    expect((await latestPrice("PROV-A")).price).toBe(42);
  });

  it("builds 4-hour bars from the provider's hourly ones", async () => {
    const prices = fakePrices({ bars: 48 });
    setPriceProvider(prices);
    const s = await getSeries("PROV-B", "4h", "60d");
    expect(prices.calls).toEqual(["PROV-B|1h|60d"]);
    expect(s.candles.length).toBeGreaterThanOrEqual(12);
    expect(s.candles.length).toBeLessThanOrEqual(13);
  });

  it("falls back to the stale cache, then to synthetic data, when the provider is down", async () => {
    setPriceProvider(fakePrices({ prices: { "PROV-C": 7 } }));
    await getSeries("PROV-C", "1d", "2y");
    run("UPDATE market_cache SET fetched_at = 0 WHERE key = 'PROV-C|1d|2y'");
    const down = downPrices();
    setPriceProvider(down);
    const stale = await getSeries("PROV-C", "1d", "2y");
    expect(stale.source).toBe("cache");
    expect(stale.candles.at(-1)!.c).toBe(7);
    expect((await getSeries("PROV-D", "1d", "2y")).source).toBe("synthetic");
    expect(down.calls).toBe(2);
  });
});

/* ---------- SIP: the MPIN rule ---------- */

describe("sipNeedsMpin", () => {
  const plan = { amount: 100_00, frequency: "monthly" as const, next_run_at: 1_000_000 };
  it("needs it to set one up, or to move more money sooner", () => {
    expect(sipNeedsMpin(undefined, { amount: 1, frequency: "monthly" })).toBe(true);
    expect(sipNeedsMpin(plan, { amount: 100_01, frequency: "monthly" })).toBe(true);
    expect(sipNeedsMpin(plan, { amount: 100_00, frequency: "weekly" })).toBe(true); // 4.33 debits a month
    expect(sipNeedsMpin(plan, { amount: 100_00, frequency: "monthly", startAt: 999_999 })).toBe(true);
  });
  it("doesn't to lower it, keep it, or push the next debit later", () => {
    expect(sipNeedsMpin(plan, { amount: 50_00, frequency: "monthly" })).toBe(false);
    expect(sipNeedsMpin(plan, { amount: 100_00, frequency: "monthly", startAt: 2_000_000 })).toBe(false);
    expect(sipNeedsMpin({ ...plan, frequency: "weekly" }, { amount: 400_00, frequency: "monthly" })).toBe(false); // 433.33 → 400 a month
  });
});

describe("POST /invest/core/sip (invest_sip)", () => {
  it("refuses to set one up without the MPIN, or with a wrong one, and saves nothing", async () => {
    const none = await saveSip({ amount: 100, frequency: "monthly" });
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: "Enter your MPIN to continue.", code: "mpin_required" });
    const wrong = await saveSip({ amount: 100, frequency: "monthly", pin: WRONG });
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("mpin_wrong");
    expect(sip()).toBeUndefined();
  });

  it("sets one up with the MPIN", async () => {
    const r = await saveSip({ amount: 100, frequency: "monthly", pin: PIN });
    expect(r.status).toBe(200);
    expect(sip()).toMatchObject({ amount: 100_00, frequency: "monthly" });
  });

  it("needs the MPIN to raise it, to turn it weekly, or to bring the next debit forward", async () => {
    for (const body of [
      { amount: 150, frequency: "monthly" },
      { amount: 100, frequency: "weekly" },
      { amount: 100, frequency: "monthly", startDate: new Date(Date.now() - DAY).toISOString() },
    ]) {
      const r = await saveSip(body);
      expect(r.status).toBe(401);
      expect((await r.json()).code).toBe("mpin_required");
    }
    expect(sip()).toMatchObject({ amount: 100_00, frequency: "monthly" });
    expect((await saveSip({ amount: 150, frequency: "monthly", pin: PIN })).status).toBe(200);
    expect(sip()!.amount).toBe(150_00);
  });

  it("lowers it and pauses it without the MPIN", async () => {
    expect((await saveSip({ amount: 80, frequency: "monthly" })).status).toBe(200);
    expect(sip()!.amount).toBe(80_00);
    // A pin sent along when none is needed isn't checked, so a wrong one doesn't count against the person.
    expect((await saveSip({ amount: 70, frequency: "monthly", pin: WRONG })).status).toBe(200);
    expect(all("SELECT 1 FROM mpin_attempts WHERE user_id = ? AND failures > 0", main.id)).toHaveLength(0);
    expect((await call(pauseSipRoute, req("/api/v1/invest/core/sip", { method: "DELETE" }))).status).toBe(200);
    expect(sip()).toBeUndefined();
  });

  it("refuses a start date that isn't a date", async () => {
    const r = await saveSip({ amount: 100, frequency: "monthly", startDate: "soon", pin: PIN });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("bad_start_date");
  });
});

/* ---------- Satellite ---------- */

describe("POST /invest/satellite/opt-in (satellite_opt_in)", () => {
  const optIn = (body: Record<string, unknown>) => call(optInRoute, req("/api/v1/invest/satellite/opt-in", { body }));

  it("needs the MPIN before any money moves", async () => {
    await executeSip(me(), 1_000_00); // Core funded first (eligibility), priced by the fake
    const before = { bank: bank(), journals: journals() };
    const none = await optIn({ amount: 10, acknowledged: DISCLOSURES.length });
    expect(none.status).toBe(401);
    expect((await none.json()).code).toBe("mpin_required");
    const wrong = await optIn({ amount: 10, acknowledged: DISCLOSURES.length, pin: WRONG });
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("mpin_wrong");
    expect({ bank: bank(), journals: journals() }).toEqual(before);
    expect(me().satellite_opt_in).toBe(0);
  });

  it("opts in with the MPIN, moving the allocation from the bank", async () => {
    const before = bank();
    const r = await optIn({ amount: 10, acknowledged: DISCLOSURES.length, pin: PIN });
    expect(r.status).toBe(201);
    expect(bank()).toBe(before - 10_00);
    expect(balanceOf(userAccount(main.id, "satellite_cash", "USD").id)).toBe(10_00);
    expect(me().satellite_opt_in).toBe(1);
    // Adding to the allocation later is the same money action.
    expect((await optIn({ amount: 5, acknowledged: DISCLOSURES.length })).status).toBe(401);
  });

  it("POST /invest/satellite/run moves no ledger money, so it needs no MPIN", async () => {
    const before = { bank: bank(), journals: journals() };
    const r = await call(runRoute, req("/api/v1/invest/satellite/run", { body: {} }));
    expect(r.status).toBe(200);
    expect({ bank: bank(), journals: journals() }).toEqual(before);
  });
});

describe("the ID gate stays on SIP and opt-in", () => {
  it("answers kyc_required before asking for the MPIN", async () => {
    run("UPDATE users SET kyc_status = 'pending' WHERE id = ?", main.id);
    try {
      const s = await saveSip({ amount: 100, frequency: "monthly", pin: PIN });
      expect(s.status).toBe(403);
      expect((await s.json()).code).toBe("kyc_required");
      const o = await call(optInRoute, req("/api/v1/invest/satellite/opt-in", { body: { amount: 1, acknowledged: DISCLOSURES.length, pin: PIN } }));
      expect((await o.json()).code).toBe("kyc_required");
    } finally {
      run("UPDATE users SET kyc_status = 'verified' WHERE id = ?", main.id);
    }
  });
});
