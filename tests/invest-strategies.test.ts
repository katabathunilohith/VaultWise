import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { all, db, get, run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createUser, type User } from "@/lib/users";
import { allStrategies, backtestMarket, satelliteOverview, setPriceProvider, strategyFor, strategyId } from "@/lib/invest";
import { GET as adminOverview } from "@/app/api/v1/admin/overview/route";
import { fakePrices } from "./helpers/prices";

/**
 * B9: a Satellite backtest belongs to the customer who ran it. Before, `strategies` had one row per market for
 * everyone, so one customer's backtest overwrote another's and showed up in their overview.
 */

const fresh = (id: string) => get<User>("SELECT * FROM users WHERE id = ?", id)!;
const ada = createUser({ name: "Ada Backtest", jurisdiction: "US", pin: "482915", createdAt: Date.now() - 60_000 });
const bo = createUser({ name: "Bo Backtest", jurisdiction: "US", pin: "482915" });
const BTC_1H = strategyId("BTC-USD", "1h");

describe("strategies are per customer", () => {
  it("keeps each customer's backtest to themselves", async () => {
    setPriceProvider(fakePrices({ bars: 400 }));
    const a = await backtestMarket(fresh(ada.id), "BTC-USD", "1h");
    expect(strategyFor(ada.id, BTC_1H)).toMatchObject({ user_id: ada.id, id: BTC_1H });
    expect(strategyFor(bo.id, BTC_1H)).toBeUndefined();

    // Bo's overview doesn't show Ada's result for the same market.
    const boView = await satelliteOverview(fresh(bo.id));
    expect(boView.markets.find((m) => m.symbol === "BTC-USD")!.gate).toBeNull();
    const adaView = await satelliteOverview(fresh(ada.id));
    expect(adaView.markets.find((m) => m.symbol === "BTC-USD")!.gate).toMatchObject({ ranAt: a.ranAt });

    // Bo running the same backtest later leaves Ada's row exactly as it was.
    const adaRow = strategyFor(ada.id, BTC_1H)!;
    await new Promise((r) => setTimeout(r, 5));
    const b = await backtestMarket(fresh(bo.id), "BTC-USD", "1h");
    expect(b.ranAt).toBeGreaterThan(a.ranAt);
    expect(strategyFor(ada.id, BTC_1H)).toEqual(adaRow);
    expect(JSON.parse(strategyFor(bo.id, BTC_1H)!.last_backtest!).ranAt).toBe(b.ranAt);
    expect(all("SELECT user_id FROM strategies WHERE id = ? ORDER BY user_id", BTC_1H)).toHaveLength(2);
  }, 60_000);

  it("lists everyone's for the reviewer console, with whose each is and a unique row id", async () => {
    expect(allStrategies().map((s) => [s.user_id, s.customer])).toEqual(
      expect.arrayContaining([
        [ada.id, "Ada Backtest"],
        [bo.id, "Bo Backtest"],
      ]),
    );
    const body = await (await adminOverview()).json();
    const rows = body.strategies.filter((s: { strategyId: string }) => s.strategyId === BTC_1H);
    expect(rows.map((s: { userId: string }) => s.userId).sort()).toEqual([ada.id, bo.id].sort());
    expect(new Set(body.strategies.map((s: { id: string }) => s.id)).size).toBe(body.strategies.length);
  });
});

describe("migrating the old shared table", () => {
  it("gives each shared row to the customer whose backtest it held, and drops rows nobody ran", () => {
    // That customer is the newest strategy.gate_* audit entry for the strategy: Bo ran ETH after Ada.
    const ETH = strategyId("ETH-USD", "4h");
    audit({ userId: ada.id, actor: "strategy-governance", actorType: "system", action: "strategy.gate_failed", entityType: "strategy", entityId: ETH });
    audit({ userId: bo.id, actor: "strategy-governance", actorType: "system", action: "strategy.gate_passed", entityType: "strategy", entityId: ETH });
    audit({ userId: ada.id, actor: "strategy-governance", actorType: "system", action: "strategy.gate_failed", entityType: "strategy", entityId: "smc:SPY:1d" });

    // Put the database back to the old shape, as an older server left it.
    const file = path.join(process.env.VAULTWISE_DATA_DIR!, "vaultwise.db");
    db().close();
    globalThis.__vaultwiseDb = undefined;
    const old = new DatabaseSync(file);
    old.exec(`DROP TABLE strategies;
      CREATE TABLE strategies (id TEXT PRIMARY KEY, name TEXT NOT NULL, params TEXT NOT NULL, stage TEXT NOT NULL,
        last_backtest TEXT, paper_started_at INTEGER, promoted_at INTEGER, created_at INTEGER NOT NULL);`);
    const insert = old.prepare("INSERT INTO strategies (id, name, params, stage, last_backtest, created_at) VALUES (?, ?, '{}', ?, ?, 1)");
    insert.run(ETH, "SMC confluence v1 · ETH-USD 4h", "paper-eligible", '{"ranAt":2}');
    insert.run("smc:SPY:1d", "SMC confluence v1 · SPY 1d", "research", '{"ranAt":3}');
    insert.run("smc:NVDA:1d", "SMC confluence v1 · NVDA 1d", "research", null); // no audit entry: no owner
    old.close();

    // Reopening runs the migration.
    const rows = all<{ user_id: string; id: string; stage: string; last_backtest: string | null }>(
      "SELECT user_id, id, stage, last_backtest FROM strategies ORDER BY id",
    );
    expect(rows).toEqual([
      { user_id: bo.id, id: ETH, stage: "paper-eligible", last_backtest: '{"ranAt":2}' },
      { user_id: ada.id, id: "smc:SPY:1d", stage: "research", last_backtest: '{"ranAt":3}' },
    ]);
    const cols = all<{ name: string; pk: number }>("PRAGMA table_info(strategies)");
    expect(cols.filter((c) => c.pk > 0).map((c) => c.name)).toEqual(["user_id", "id"]);
    expect(get("SELECT 1 FROM sqlite_master WHERE name = 'strategies_shared'")).toBeUndefined();
    // And the new shape works: Ada can save her own ETH row next to Bo's.
    run("INSERT INTO strategies (user_id, id, name, params, stage, created_at) VALUES (?, ?, 'x', '{}', 'research', 1)", ada.id, ETH);
    expect(all("SELECT 1 FROM strategies WHERE id = ?", ETH)).toHaveLength(2);
  });
});
