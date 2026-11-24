import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, run, tx } from "@/lib/db";
import { createUser, type User } from "@/lib/users";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createVault, createWithdrawal, deposit, payoutWithdrawal } from "@/lib/vaults";
import { cashOut, spend, topUp, updateWalletSettings } from "@/lib/wallet";
import { executeEmergency } from "@/lib/emergency";
import { changeLimits, getLimits } from "@/lib/limits";
import { changeMpin, requireMpin } from "@/lib/mpin";
import { setVerifiedPhone } from "@/lib/otp";
import { touchDevice } from "@/lib/devices";
import {
  alertDeviceRevoked,
  ALERT_KINDS,
  EXPO_PUSH_URL,
  listAlerts,
  markRead,
  pushTokensFor,
  raiseAlert,
  registerPushToken,
  setAlertSenders,
  inAppSender,
  unreadCount,
  type AlertKind,
  type AlertSender,
} from "@/lib/alerts";
import { GET as alertsRoute } from "@/app/api/v1/alerts/route";
import { POST as readRoute } from "@/app/api/v1/alerts/read/route";
import { DELETE as pushUnregister, POST as pushRegister } from "@/app/api/v1/push/register/route";

/* ---------- Helpers ---------- */

const HOUR = 3_600_000;
const PIN = "482915";

function req(path: string, opts: { method?: string; body?: unknown; device?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.device) headers["x-device-id"] = opts.device;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const call = (h: unknown, request?: Request) => (h as (...a: unknown[]) => Promise<Response>)(request);

function newCustomer(name: string, funds = 5_000_00, createdAt?: number) {
  const u = createUser({ name, jurisdiction: "US", pin: PIN, createdAt });
  transfer({ userId: u.id, from: worldAccount("USD").id, to: userAccount(u.id, "bank", "USD").id, amount: funds, kind: "income", memo: "seed" });
  return () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
}

const kindsOf = (userId: string) => listAlerts(userId, { limit: 200 }).map((a) => a.kind);
const lastOf = (userId: string, kind: AlertKind) => listAlerts(userId, { limit: 200 }).find((a) => a.kind === kind);

/** Lets the "later" senders (push) run. */
async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";
const TOKEN2 = "ExpoPushToken[zyxwvutsrqponmlkjihgfe]";

// Prototype mode: the first user is the customer the routes act for.
const main = newCustomer("Ada Alerts", 5_000_00, Date.now() - HOUR);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ALERTS_PUSH;
  delete process.env.EXPO_ACCESS_TOKEN;
  setAlertSenders(null);
});

/* ---------- The inbox ---------- */

describe("the in-app inbox", () => {
  it("records an alert and counts it unread until read", () => {
    const u = newCustomer("Inbox Ivy");
    const a = raiseAlert(u().id, "money_out", "Money sent", "Test body")!;
    expect(a).toMatchObject({ kind: "money_out", title: "Money sent", body: "Test body", readAt: null });
    expect(listAlerts(u().id)).toEqual([a]);
    expect(unreadCount(u().id)).toBe(1);
    raiseAlert(u().id, "limit_loosened", "Limit raised", "Another");
    expect(markRead(u().id, [a.id, a.id, "alt_not_mine"])).toBe(1);
    expect(unreadCount(u().id)).toBe(1);
    expect(listAlerts(u().id, { unreadOnly: true }).map((x) => x.kind)).toEqual(["limit_loosened"]);
    expect(markRead(u().id)).toBe(1);
    expect(unreadCount(u().id)).toBe(0);
  });

  it("is never written for work that rolled back, and never throws", () => {
    const u = newCustomer("Rollback Rae");
    expect(() =>
      tx(() => {
        raiseAlert(u().id, "money_out", "Money sent", "Should vanish");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(listAlerts(u().id)).toHaveLength(0);
    const broken: AlertSender = {
      name: "broken",
      when: "now",
      send: () => {
        throw new Error("disk full");
      },
    };
    setAlertSenders([broken]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(raiseAlert(u().id, "money_out", "Money sent", "x")).toBeNull();
  });

  it("serves GET /alerts (?unread=1) and POST /alerts/read", async () => {
    const first = raiseAlert(main().id, "mpin_changed", "MPIN changed", "One")!;
    raiseAlert(main().id, "phone_verified", "Phone number verified", "Two");
    const all = await (await call(alertsRoute, req("/api/v1/alerts"))).json();
    expect(all.unread).toBe(2);
    expect(all.alerts.map((a: { body: string }) => a.body)).toEqual(["Two", "One"]);
    expect(Object.keys(all.alerts[0]).sort()).toEqual(["body", "createdAt", "id", "kind", "readAt", "title"]);

    expect(await (await call(readRoute, req("/api/v1/alerts/read", { body: { ids: [first.id] } }))).json()).toEqual({ ok: true, unread: 1 });
    const unread = await (await call(alertsRoute, req("/api/v1/alerts?unread=1"))).json();
    expect(unread.alerts.map((a: { body: string }) => a.body)).toEqual(["Two"]);
    expect(await (await call(readRoute, req("/api/v1/alerts/read", { body: {} }))).json()).toEqual({ ok: true, unread: 0 });
    expect((await call(alertsRoute, req("/api/v1/alerts?limit=abc"))).status).toBe(400);
  });
});

/* ---------- Every kind, from where it happens ---------- */

describe("alerts raised where things happen", () => {
  it("money_out: wallet spend and cash-out, a paid vault withdrawal, an emergency release", () => {
    const u = newCustomer("Money Mo");
    topUp(u(), 1_000_00);
    spend(u(), { amount: 12_50, payee: "Corner shop" });
    expect(lastOf(u().id, "money_out")!.body).toMatch(/^\$12\.50 paid to Corner shop from your wallet\./);
    cashOut(u(), 20_00);
    expect(lastOf(u().id, "money_out")!.body).toMatch(/^\$20\.00 moved from your wallet to your bank\./);

    const vault = createVault(u(), { name: "Clinic", category: "health", target: 2_000_00 });
    deposit(u(), vault, 500_00);
    const w = createWithdrawal(u(), vault, 30_00, "City Clinic");
    run("UPDATE withdrawals SET status = 'verifying' WHERE id = ?", w);
    payoutWithdrawal(u(), w, "test", "reviewer");
    expect(lastOf(u().id, "money_out")!.body).toMatch(/^\$30\.00 paid from Clinic to City Clinic\./);

    const before = kindsOf(u().id).filter((k) => k === "money_out").length;
    const r = executeEmergency(u(), { amount: 40_00, reasonCode: "medical", attest: true });
    expect(r.status).toBe("released");
    expect(kindsOf(u().id).filter((k) => k === "money_out")).toHaveLength(before + 1);
    expect(lastOf(u().id, "money_out")!.title).toBe("Emergency money released");
  });

  it("limit_loosened: a withdrawal limit raised, and the wallet's daily limit raised or turned off", () => {
    const u = newCustomer("Limit Lou");
    const cur = getLimits(u());
    changeLimits(u(), { singleWithdrawal: cur.singleWithdrawal - 100 });
    expect(kindsOf(u().id)).not.toContain("limit_loosened"); // tightening is no alert
    changeLimits(u(), { singleWithdrawal: cur.singleWithdrawal });
    expect(lastOf(u().id, "limit_loosened")!.body).toMatch(/^You raised a withdrawal limit\./);

    updateWalletSettings(u(), { dailyLimit: 100_00 });
    expect(kindsOf(u().id).filter((k) => k === "limit_loosened")).toHaveLength(1);
    updateWalletSettings(u(), { dailyLimit: null });
    expect(lastOf(u().id, "limit_loosened")!.body).toMatch(/^You turned off your wallet's daily limit\./);
  });

  it("mpin_locked when wrong tries lock money moves, and mpin_changed when the MPIN changes", () => {
    const u = newCustomer("Pin Pat");
    for (let i = 0; i < 5; i++) {
      try {
        requireMpin(u(), "000000", "wallet_spend");
      } catch {
        // wrong MPIN
      }
    }
    const locked = listAlerts(u().id).filter((a) => a.kind === "mpin_locked");
    expect(locked).toHaveLength(1);
    expect(locked[0].body).toContain("1 minute");
    run("UPDATE mpin_attempts SET failures = 0, locked_until = NULL WHERE user_id = ?", u().id);
    changeMpin(u(), PIN, "739204");
    expect(lastOf(u().id, "mpin_changed")!.title).toBe("MPIN changed");
  });

  it("phone_verified with the masked number, and new_device for a later device", () => {
    const u = newCustomer("Phone Phil");
    setVerifiedPhone(u(), "+919876543210");
    expect(lastOf(u().id, "phone_verified")!.body).toMatch(/^\+91••••••3210 is now/);
    touchDevice(u(), new Headers({ "x-device-id": "alerts-dev-0001", "x-device-platform": "ios" }));
    expect(kindsOf(u().id)).not.toContain("new_device");
    touchDevice(u(), new Headers({ "x-device-id": "alerts-dev-0002", "x-device-platform": "android" }));
    expect(lastOf(u().id, "new_device")!.body).toContain("an Android phone");
  });

  it("device_revoked doesn't promise the device is out for good (it can sign in again, as a limited new device)", () => {
    const u = newCustomer("Revo Ravi");
    tx(() => alertDeviceRevoked(u().id, "android"));
    const body = lastOf(u().id, "device_revoked")!.body;
    expect(body).not.toMatch(/can't use it any more/);
    expect(body).toMatch(/^An Android phone was signed out of your account. To use it again it must sign in again/);
    expect(body).toMatch(/texted code and your MPIN/);
  });

  it("uses only the contract's kinds", () => {
    expect([...ALERT_KINDS].sort()).toEqual(
      ["device_revoked", "device_trusted", "limit_loosened", "money_out", "mpin_changed", "mpin_locked", "new_device", "phone_verified"].sort(),
    );
  });
});

/* ---------- Push ---------- */

describe("Expo push", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const okTickets = (n: number) => Response.json({ data: Array.from({ length: n }, (_, i) => ({ status: "ok", id: `t${i}` })) });

  beforeEach(() => {
    fetchMock = vi.fn(async () => okTickets(1));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("registers Expo push tokens through the route, and refuses anything else", async () => {
    const bad = await call(pushRegister, req("/api/v1/push/register", { body: { token: "not-a-token", platform: "android" } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("push_token_invalid");
    const r = await call(pushRegister, req("/api/v1/push/register", { body: { token: TOKEN, platform: "android" } }));
    expect(await r.json()).toEqual({ ok: true });
    expect(pushTokensFor(main().id)).toEqual([{ token: TOKEN, userId: main().id, platform: "android", deviceId: null }]);
    expect(await (await call(pushUnregister, req("/api/v1/push/register", { method: "DELETE", body: { token: TOKEN } }))).json()).toEqual({ ok: true });
    expect(pushTokensFor(main().id)).toHaveLength(0);
  });

  it("sends nothing to someone without push tokens", async () => {
    const u = newCustomer("No Tokens Ned");
    raiseAlert(u().id, "money_out", "Money sent", "x");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one message per token to Expo once the work has finished", async () => {
    const u = newCustomer("Push Penny");
    registerPushToken(u().id, { token: TOKEN, platform: "ios", deviceId: null });
    registerPushToken(u().id, { token: TOKEN2, platform: "android", deviceId: null });
    fetchMock.mockImplementation(async () => okTickets(2));
    process.env.EXPO_ACCESS_TOKEN = "expo-secret";
    const a = raiseAlert(u().id, "money_out", "Money sent", "$5.00 paid")!;
    expect(fetchMock).not.toHaveBeenCalled(); // not inside the caller's work
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer expo-secret");
    const messages = JSON.parse(String(init.body));
    expect(messages).toHaveLength(2);
    expect(messages.map((m: { to: string }) => m.to).sort()).toEqual([TOKEN, TOKEN2].sort());
    expect(messages[0]).toMatchObject({ title: "Money sent", body: "$5.00 paid", sound: "default", data: { alertId: a.id, kind: "money_out" } });
  });

  it("drops tokens Expo says are no longer registered", async () => {
    const u = newCustomer("Gone Gail");
    registerPushToken(u().id, { token: TOKEN, platform: "ios", deviceId: null });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => Response.json({ data: [{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }] }));
    raiseAlert(u().id, "money_out", "Money sent", "x");
    await vi.waitFor(() => expect(pushTokensFor(u().id)).toHaveLength(0));
  });

  it("never throws when Expo is down, and keeps the alert in the app", async () => {
    const u = newCustomer("Down Dan");
    registerPushToken(u().id, { token: TOKEN, platform: "ios", deviceId: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNRESET");
    });
    expect(raiseAlert(u().id, "money_out", "Money sent", "x")).not.toBeNull();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(listAlerts(u().id)).toHaveLength(1);
    expect(pushTokensFor(u().id)).toHaveLength(1);
  });

  it("sends nothing for an alert whose work rolled back, or with ALERTS_PUSH=false", async () => {
    const u = newCustomer("Quiet Quinn");
    registerPushToken(u().id, { token: TOKEN, platform: "ios", deviceId: null });
    expect(() =>
      tx(() => {
        raiseAlert(u().id, "money_out", "Money sent", "rolled back");
        throw new Error("boom");
      }),
    ).toThrow();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.ALERTS_PUSH = "false";
    raiseAlert(u().id, "money_out", "Money sent", "in app only");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listAlerts(u().id)).toHaveLength(1);
  });

  it("keeps the newest 10 tokens per person, and moves a token to whoever registers it last", () => {
    const a = newCustomer("Many Max");
    const b = newCustomer("Next Nia");
    for (let i = 0; i < 12; i++) registerPushToken(a().id, { token: `ExpoPushToken[token-number-${String(i).padStart(4, "0")}]`, platform: "android", deviceId: null }, 1_000 + i);
    expect(pushTokensFor(a().id)).toHaveLength(10);
    expect(pushTokensFor(a().id).map((t) => t.token)).not.toContain("ExpoPushToken[token-number-0000]");
    registerPushToken(b().id, { token: "ExpoPushToken[token-number-0011]", platform: "android", deviceId: null });
    expect(pushTokensFor(a().id)).toHaveLength(9);
    expect(pushTokensFor(b().id)).toHaveLength(1);
  });

  it("lets a test (or a new channel) swap the senders", async () => {
    const u = newCustomer("Swap Sam");
    const seen: string[] = [];
    setAlertSenders([inAppSender, { name: "email", when: "later", send: (a) => void seen.push(a.title) }]);
    raiseAlert(u().id, "mpin_changed", "MPIN changed", "x");
    await flush();
    expect(seen).toEqual(["MPIN changed"]);
  });
});
