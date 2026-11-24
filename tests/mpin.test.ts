import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { all, get, run, tx } from "@/lib/db";
import { checkPin, createUser, HttpError, type User } from "@/lib/users";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { cancelWithdrawal, createVault, createWithdrawal, deposit, payoutWithdrawal } from "@/lib/vaults";
import { executeEmergency, planEmergency } from "@/lib/emergency";
import { getLimits } from "@/lib/limits";
import { topUp, updateWalletSettings } from "@/lib/wallet";
import { setVerificationKey } from "@/lib/auth/verify";
import { identityByUid } from "@/lib/auth/identities";
import {
  assertNewMpin,
  attemptState,
  birthDateAsPin,
  checkNewMpin,
  COMMON_MPINS,
  lockMsAfter,
  MpinError,
  requireMpin,
  triesLeftAfter,
} from "@/lib/mpin";
import { MONEY_ACTIONS, MONEY_ROUTES } from "@/lib/money-routes";
import { POST as withdrawRoute } from "@/app/api/v1/vaults/[id]/withdrawals/route";
import { POST as spendRoute } from "@/app/api/v1/wallet/spend/route";
import { POST as cashOutRoute } from "@/app/api/v1/wallet/cash-out/route";
import { POST as moveRoute } from "@/app/api/v1/wallet/move/route";
import { PUT as walletSettingsRoute } from "@/app/api/v1/wallet/settings/route";
import { POST as emergencyRoute } from "@/app/api/v1/emergency/withdrawals/route";
import { PUT as limitsRoute } from "@/app/api/v1/limits/route";
import { POST as emergencyLimitRoute } from "@/app/api/v1/limits/emergency/route";
import { POST as investBuyRoute } from "@/app/api/v1/invest/core/buy/route";
import { POST as investSipRoute } from "@/app/api/v1/invest/core/sip/route";
import { POST as satelliteOptInRoute } from "@/app/api/v1/invest/satellite/opt-in/route";
import { POST as mpinRoute } from "@/app/api/v1/mpin/route";
import { POST as mpinResetRoute } from "@/app/api/v1/mpin/reset/route";
import { POST as phoneRoute } from "@/app/api/v1/me/phone/route";
import { listAlerts } from "@/lib/alerts";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/me/route";
import { POST as onboard } from "@/app/api/v1/onboarding/route";
import { POST as resetRoute } from "@/app/api/v1/reset/route";

/* ---------- Helpers ---------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const LEGACY = "1234"; // existing accounts keep their 4-digit PIN until they change it
const NEW_PIN = "739204";
const WRONG = "8642";

function req(path: string, opts: { token?: string; method?: string; body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const call = (h: unknown, request?: Request, context?: unknown) => (h as (...a: unknown[]) => Promise<Response>)(request, context);

/** Runs `fn` and returns the MpinError it throws. */
function mpinErrorOf(fn: () => unknown): MpinError {
  try {
    fn();
  } catch (e) {
    if (e instanceof MpinError) return e;
    throw e;
  }
  throw new Error("expected an MpinError");
}

const auditRows = (userId: string, action: string) =>
  all<{ details: string; ts: number }>("SELECT details, ts FROM audit_log WHERE user_id = ? AND action = ? ORDER BY id", userId, action);

function fund(u: User, amount: number) {
  transfer({ userId: u.id, from: worldAccount(u.currency).id, to: userAccount(u.id, "bank", u.currency).id, amount, kind: "income", memo: "seed" });
}

// Prototype mode: the first user is the customer every route acts for. Created first, and earlier.
const main = createUser({ name: "Mina Park", jurisdiction: "US", pin: LEGACY, createdAt: Date.now() - HOUR });
const me = () => get<User>("SELECT * FROM users WHERE id = ?", main.id)!;
fund(main, 5_000_00);
const health = createVault(me(), { name: "Health", category: "health", target: 2_000_00 });
deposit(me(), health, 500_00);
topUp(me(), 500_00);
updateWalletSettings(me(), { dailyLimit: 100_00 });

function clearAttempts(userId: string) {
  run("DELETE FROM mpin_attempts WHERE user_id = ?", userId);
}

/* ---------- Policy ---------- */

describe("MPIN policy", () => {
  it("accepts a 6-digit MPIN that isn't easy to guess", () => {
    expect(checkNewMpin("482915")).toEqual({ ok: true });
  });

  it("refuses the wrong length, repeated digits, straight runs and common PINs", () => {
    for (const pin of ["1234", "12345", "1234567", "12a456", ""]) expect(checkNewMpin(pin)).toMatchObject({ ok: false, reason: "length" });
    for (const pin of ["000000", "777777"]) expect(checkNewMpin(pin)).toMatchObject({ ok: false, reason: "repeated" });
    for (const pin of ["123456", "654321", "567890", "098765", "901234"]) expect(checkNewMpin(pin)).toMatchObject({ ok: false, reason: "sequence" });
    for (const pin of COMMON_MPINS) expect(checkNewMpin(pin)).toMatchObject({ ok: false, reason: "common" });
  });

  it("refuses the person's date of birth as DDMMYY when known", () => {
    expect(birthDateAsPin("1994-07-21")).toBe("210794");
    expect(checkNewMpin("210794", { dob: "1994-07-21" })).toMatchObject({ ok: false, reason: "birth_date" });
    expect(checkNewMpin("210794")).toEqual({ ok: true });
  });

  it("is switch-aware when someone chooses a PIN", () => {
    expect(() => assertNewMpin("1234")).toThrow(MpinError);
    expect(mpinErrorOf(() => assertNewMpin("111111")).extra).toEqual({ reason: "repeated" });
    process.env.MPIN_ENFORCED = "false";
    try {
      expect(() => assertNewMpin("1234")).not.toThrow(); // older phone builds still sign up
      expect(() => assertNewMpin("12")).toThrow(HttpError);
    } finally {
      delete process.env.MPIN_ENFORCED;
    }
  });
});

/* ---------- Lockout ---------- */

describe("lockout", () => {
  it("locks after every 5 wrong tries: 1 minute, 5 minutes, 30 minutes, then 24 hours for good", () => {
    expect([1, 2, 3, 4, 6, 9].map(lockMsAfter)).toEqual([null, null, null, null, null, null]);
    expect([5, 10, 15, 20, 25, 50].map(lockMsAfter)).toEqual([MIN, 5 * MIN, 30 * MIN, 24 * HOUR, 24 * HOUR, 24 * HOUR]);
    expect([0, 3, 4, 5, 6].map(triesLeftAfter)).toEqual([5, 2, 1, 5, 4]);
  });

  it("escalates through requireMpin, refuses while locked, audits each wrong try, and resets on a right MPIN", () => {
    const u = createUser({ name: "Lock Tester", jurisdiction: "US", pin: LEGACY });
    let now = Date.now();
    expect(mpinErrorOf(() => requireMpin(u, undefined, "withdraw", { now }))).toMatchObject({ status: 401, code: "mpin_required" });

    const wrongRun = (expectedLock: number) => {
      for (let i = 4; i >= 1; i--) {
        const e = mpinErrorOf(() => requireMpin(u, WRONG, "withdraw", { now }));
        expect(e).toMatchObject({ status: 403, code: "mpin_wrong", extra: { triesLeft: i } });
        expect(e.message).toMatch(i === 1 ? /1 try left/ : new RegExp(`${i} tries left`));
      }
      const locked = mpinErrorOf(() => requireMpin(u, WRONG, "withdraw", { now }));
      expect(locked).toMatchObject({ status: 423, code: "mpin_locked", extra: { lockedUntil: now + expectedLock } });
      // While locked even the right MPIN is refused, and the try isn't counted.
      const failures = attemptState(u.id).failures;
      expect(mpinErrorOf(() => requireMpin(u, LEGACY, "withdraw", { now: now + 1000 }))).toMatchObject({ status: 423, code: "mpin_locked" });
      expect(attemptState(u.id).failures).toBe(failures);
      now += expectedLock + 1000;
    };
    wrongRun(MIN);
    wrongRun(5 * MIN);
    wrongRun(30 * MIN);
    wrongRun(24 * HOUR);
    wrongRun(24 * HOUR);

    const failed = auditRows(u.id, "mpin.failed");
    expect(failed).toHaveLength(25);
    expect(auditRows(u.id, "mpin.locked")).toHaveLength(5);
    expect(JSON.parse(failed[0].details)).toMatchObject({ action: "withdraw", failures: 1, triesLeft: 4 });
    // The PIN is never written to the audit log.
    expect(JSON.stringify(all("SELECT details FROM audit_log WHERE user_id = ?", u.id))).not.toContain(WRONG);

    expect(requireMpin(u, LEGACY, "withdraw", { now })).toBe(true);
    expect(attemptState(u.id)).toEqual({ failures: 0, lockedUntil: null });
  });

  it("refuses to run inside a money transaction, so its audit row can't be rolled back", () => {
    expect(() => tx(() => requireMpin(me(), LEGACY, "withdraw"))).toThrow(/before the money transaction/);
  });
});

/* ---------- Every money route ---------- */

const loosened = () => getLimits(me()).singleWithdrawal / 100 + 1;
const emergencyForm = (pin?: string) => {
  const fd = new FormData();
  fd.append("singleWithdrawal", String(loosened()));
  fd.append("reasonCode", "medical");
  fd.append("explanation", "Hospital deposit due on Friday for my mother's surgery.");
  if (pin !== undefined) fd.append("pin", pin);
  return fd;
};

const ROUTES: { action: string; send: (pin?: string) => Promise<Response> }[] = [
  {
    action: "withdraw",
    send: (pin) => call(withdrawRoute, req(`/api/v1/vaults/${health}/withdrawals`, { body: { amount: 1, payee: "City Clinic", pin } }), ctx({ id: health })),
  },
  { action: "wallet_spend", send: (pin) => call(spendRoute, req("/api/v1/wallet/spend", { body: { amount: 1, payee: "Corner shop", pin } })) },
  { action: "wallet_cash_out", send: (pin) => call(cashOutRoute, req("/api/v1/wallet/cash-out", { body: { amount: 1, pin } })) },
  { action: "wallet_move", send: (pin) => call(moveRoute, req("/api/v1/wallet/move", { body: { vaultId: health, amount: 1, pin } })) },
  {
    action: "wallet_limit_raise",
    send: (pin) => call(walletSettingsRoute, req("/api/v1/wallet/settings", { method: "PUT", body: { dailyLimit: 500, pin } })),
  },
  {
    action: "wallet_limit_raise (turning it off)",
    send: (pin) => call(walletSettingsRoute, req("/api/v1/wallet/settings", { method: "PUT", body: { dailyLimit: null, pin } })),
  },
  {
    action: "emergency",
    send: (pin) => call(emergencyRoute, req("/api/v1/emergency/withdrawals", { body: { amount: 1, reasonCode: "medical", attest: true, pin } })),
  },
  {
    action: "limits_loosen",
    send: (pin) => call(limitsRoute, req("/api/v1/limits", { method: "PUT", body: { singleWithdrawal: loosened(), pin } })),
  },
  { action: "limits_loosen (emergency request)", send: (pin) => call(emergencyLimitRoute, req("/api/v1/limits/emergency", { form: emergencyForm(pin) })) },
  { action: "invest_buy", send: (pin) => call(investBuyRoute, req("/api/v1/invest/core/buy", { body: { amount: 10, pin } })) },
  // Setting up a SIP (raising and lowering one: tests/invest-money.test.ts).
  { action: "invest_sip", send: (pin) => call(investSipRoute, req("/api/v1/invest/core/sip", { body: { amount: 10, frequency: "monthly", pin } })) },
  {
    action: "satellite_opt_in",
    send: (pin) => call(satelliteOptInRoute, req("/api/v1/invest/satellite/opt-in", { body: { amount: 10, acknowledged: 4, pin } })),
  },
  { action: "mpin_change", send: (pin) => call(mpinRoute, req("/api/v1/mpin", { body: { currentPin: pin, newPin: NEW_PIN } })) },
  // otp: adding the first phone number (replacing one also needs a trusted device: tests/otp.test.ts).
  { action: "phone_change", send: (pin) => call(phoneRoute, req("/api/v1/me/phone", { body: { verificationToken: "not-checked-yet", pin } })) },
];

describe("every money route", () => {
  const journals = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM journals WHERE user_id = ?", main.id)!.n;
  const withdrawals = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ?", main.id)!.n;
  let before: { journals: number; withdrawals: number };
  beforeAll(() => {
    clearAttempts(main.id);
    before = { journals: journals(), withdrawals: withdrawals() };
  });

  it("covers every action in the policy map, each needing the MPIN except money in", () => {
    // Money in from the linked bank takes the ID gate only (tests/money-in.test.ts); everything else needs the MPIN.
    for (const a of MONEY_ACTIONS) {
      const p: { mpin: boolean; moneyIn?: boolean } = MONEY_ROUTES[a];
      expect(p.mpin).toBe(!p.moneyIn);
    }
    // devices: device_trust and device_revoke (MPIN always checked) are covered in tests/devices.test.ts.
    for (const a of MONEY_ACTIONS.filter((x) => MONEY_ROUTES[x].mpin))
      expect(ROUTES.some((r) => r.action.split(" ")[0] === a || a === "close_account" || a.startsWith("device_"))).toBe(true);
  });

  it.each(ROUTES)("$action: refuses without an MPIN, with a wrong one, and while locked", async ({ send }) => {
    const none = await send(undefined);
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: "Enter your MPIN to continue.", code: "mpin_required" });

    const failedBefore = auditRows(main.id, "mpin.failed").length;
    const wrong = await send(WRONG);
    expect(wrong.status).toBe(403);
    const w = await wrong.json();
    expect(w.code).toBe("mpin_wrong");
    expect(w.error).toMatch(/4 tries left/);
    expect(auditRows(main.id, "mpin.failed")).toHaveLength(failedBefore + 1);
    expect(requireMpin(me(), LEGACY, "withdraw")).toBe(true); // a right MPIN resets the count

    for (let i = 0; i < 5; i++) mpinErrorOf(() => requireMpin(me(), WRONG, "withdraw"));
    const locked = await send(LEGACY);
    expect(locked.status).toBe(423);
    const l = await locked.json();
    expect(l.code).toBe("mpin_locked");
    expect(l.error).toMatch(/Try again in (60 seconds|1 minute)/);
    clearAttempts(main.id);
  });

  it("moved no money while refusing", () => {
    expect({ journals: journals(), withdrawals: withdrawals() }).toEqual(before);
  });

  it("GET /me reports the lock and that a 6-digit MPIN is due", async () => {
    for (let i = 0; i < 5; i++) mpinErrorOf(() => requireMpin(me(), WRONG, "withdraw"));
    const locked = await (await call(getMe)).json();
    expect(locked.mpin.upgradeDue).toBe(true);
    expect(locked.mpin.lockedUntil).toBeGreaterThan(Date.now());
    clearAttempts(main.id);
    expect((await (await call(getMe)).json()).mpin).toEqual({ upgradeDue: true, lockedUntil: null, enforced: true });
  });

  it("lets tightening and lowering through without an MPIN", async () => {
    const lower = await call(walletSettingsRoute, req("/api/v1/wallet/settings", { method: "PUT", body: { dailyLimit: 50 } }));
    expect(lower.status).toBe(200);
    const tighten = await call(limitsRoute, req("/api/v1/limits", { method: "PUT", body: { singleWithdrawal: getLimits(me()).singleWithdrawal / 200 } }));
    expect(tighten.status).toBe(200);
  });

  it("moves money with the right MPIN, including an existing 4-digit PIN", async () => {
    const cash = await call(cashOutRoute, req("/api/v1/wallet/cash-out", { body: { amount: 1, pin: LEGACY } }));
    expect(cash.status).toBe(201);
    const w = await call(withdrawRoute, req(`/api/v1/vaults/${health}/withdrawals`, { body: { amount: 1, payee: "City Clinic", pin: LEGACY } }), ctx({ id: health }));
    expect(w.status).toBe(201);
    const e = await call(emergencyRoute, req("/api/v1/emergency/withdrawals", { body: { amount: 1, reasonCode: "medical", attest: true, pin: LEGACY } }));
    expect(e.status).toBe(201);
    expect((await e.json()).status).toBe("released");
  });
});

/* ---------- Changing the MPIN ---------- */

describe("changing the MPIN", () => {
  it("refuses a weak new MPIN with a reason", async () => {
    const r = await call(mpinRoute, req("/api/v1/mpin", { body: { currentPin: LEGACY, newPin: "123456" } }));
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b).toMatchObject({ code: "mpin_weak" });
    expect(b.error).toMatch(/straight run/);
  });

  it("changes it with the current MPIN, and the upgrade is no longer due", async () => {
    const r = await call(mpinRoute, req("/api/v1/mpin", { body: { currentPin: LEGACY, newPin: NEW_PIN } }));
    expect(await r.json()).toEqual({ ok: true });
    expect(checkPin(me(), NEW_PIN)).toBe(true);
    expect(checkPin(me(), LEGACY)).toBe(false);
    expect((await (await call(getMe)).json()).mpin).toEqual({ upgradeDue: false, lockedUntil: null, enforced: true });
    expect(auditRows(main.id, "mpin.changed")).toHaveLength(1);
    // PATCH /me goes through the same rules.
    const weak = await call(patchMe, req("/api/v1/me", { method: "PATCH", body: { pin: "4321", currentPin: NEW_PIN } }));
    expect((await weak.json()).code).toBe("mpin_weak");
  });

  it("resets only with a texted-code token (plan 06; the full flow is in tests/otp.test.ts)", async () => {
    const r = await call(mpinResetRoute, req("/api/v1/mpin/reset", { body: { verificationToken: "x", newPin: "482915" } }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("verification_invalid");
  });
});

/* ---------- Switch off ---------- */

describe("MPIN_ENFORCED=false", () => {
  beforeAll(() => {
    process.env.MPIN_ENFORCED = "false";
  });
  afterAll(() => {
    delete process.env.MPIN_ENFORCED;
  });

  it("skips the checks but still counts and audits wrong tries", async () => {
    clearAttempts(main.id);
    const none = await call(cashOutRoute, req("/api/v1/wallet/cash-out", { body: { amount: 1 } }));
    expect(none.status).toBe(201);
    const failed = auditRows(main.id, "mpin.failed").length;
    const wrong = await call(cashOutRoute, req("/api/v1/wallet/cash-out", { body: { amount: 1, pin: WRONG } }));
    expect(wrong.status).toBe(201);
    expect(attemptState(main.id).failures).toBe(1);
    const rows = auditRows(main.id, "mpin.failed");
    expect(rows).toHaveLength(failed + 1);
    expect(JSON.parse(rows.at(-1)!.details)).toMatchObject({ action: "wallet_cash_out", enforced: false });
    // A lock is recorded but doesn't stop money moves, and /me doesn't report it.
    for (let i = 0; i < 4; i++) requireMpin(me(), WRONG, "withdraw");
    const lockedUntil = attemptState(main.id).lockedUntil;
    expect(lockedUntil).toBeGreaterThan(Date.now());
    expect((await (await call(getMe)).json()).mpin).toMatchObject({ lockedUntil: null, enforced: false });
    expect((await call(cashOutRoute, req("/api/v1/wallet/cash-out", { body: { amount: 1, pin: NEW_PIN } }))).status).toBe(201);
    // During the lock a PIN sent with a money move isn't checked at all (so it can't be used to keep guessing).
    expect(attemptState(main.id)).toEqual({ failures: 5, lockedUntil });
    expect(requireMpin(me(), NEW_PIN, "withdraw")).toBe(false);
    clearAttempts(main.id);
    expect(requireMpin(me(), NEW_PIN, "withdraw")).toBe(true);
  });

  it("still checks the PIN, lock included, for the checks that always need it", () => {
    clearAttempts(main.id);
    for (let i = 4; i >= 1; i--)
      expect(mpinErrorOf(() => requireMpin(me(), WRONG, "mpin_change", { always: true }))).toMatchObject({ code: "mpin_wrong", extra: { triesLeft: i } });
    const locked = mpinErrorOf(() => requireMpin(me(), WRONG, "phone_change", { always: true }));
    expect(locked).toMatchObject({ status: 423, code: "mpin_locked" });
    expect(locked.message).toMatch(/anything that needs your MPIN is locked/i);
    // Locked: even the right PIN is refused, without being checked or counted.
    expect(mpinErrorOf(() => requireMpin(me(), NEW_PIN, "device_trust", { always: true }))).toMatchObject({ status: 423, code: "mpin_locked" });
    expect(attemptState(main.id).failures).toBe(5);
    // The person is told, even in rollback mode.
    const alert = listAlerts(main.id).find((a) => a.kind === "mpin_locked")!; // newest first
    expect(alert.body).toMatch(/anything that needs your MPIN is locked for 1 minute/);
    // A lock started by money moves holds for these checks too.
    clearAttempts(main.id);
    for (let i = 0; i < 5; i++) requireMpin(me(), WRONG, "withdraw");
    expect(mpinErrorOf(() => requireMpin(me(), NEW_PIN, "mpin_change", { always: true })).code).toBe("mpin_locked");
    clearAttempts(main.id);
  });

  it("keeps the old Tier 2 emergency PIN check, and Tier 1 needs none", () => {
    const u = createUser({ name: "Tier Two", jurisdiction: "US", pin: "2468" });
    const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
    fund(u, 2_000_00);
    const h = createVault(fresh(), { name: "Health", category: "health", target: 1_000_00 });
    const rainy = createVault(fresh(), { name: "Rainy", category: "emergency", target: 1_000_00 });
    deposit(fresh(), h, 50_00);
    deposit(fresh(), rainy, 500_00);
    expect(planEmergency(fresh(), 20_00).needsPin).toBe(false);
    expect(executeEmergency(fresh(), { amount: 20_00, reasonCode: "medical", attest: true, mpinEveryTier: true }).status).toBe("released");
    expect(mpinErrorOf(() => executeEmergency(fresh(), { amount: 200_00, reasonCode: "medical", attest: true, pin: "0000", note: "Second visit this month" }))).toMatchObject({
      status: 403,
      code: "mpin_wrong",
    });
  });
});

/* ---------- Bug fixes ---------- */

describe("emergency PIN failures are audited (B1)", () => {
  it("keeps the audit row of a wrong Tier 2 PIN", () => {
    const u = createUser({ name: "Audit Kept", jurisdiction: "US", pin: "1357" });
    const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
    fund(u, 2_000_00);
    const rainy = createVault(fresh(), { name: "Rainy", category: "emergency", target: 1_000_00 });
    deposit(fresh(), rainy, 500_00);
    expect(() => executeEmergency(fresh(), { amount: 100_00, reasonCode: "medical", attest: true, pin: "9999" })).toThrow(/MPIN/);
    const rows = auditRows(u.id, "mpin.failed");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details)).toMatchObject({ action: "emergency" });
    expect(all("SELECT 1 FROM emergency_requests WHERE user_id = ?", u.id)).toHaveLength(0);
  });
});

describe("payoutWithdrawal checks owner and status (B3)", () => {
  it("refuses a withdrawal that is waiting for proof, cancelled, or someone else's", () => {
    const a = createUser({ name: "Payout Owner", jurisdiction: "US", pin: "1357" });
    const b = createUser({ name: "Someone Else", jurisdiction: "US", pin: "1357" });
    const A = () => get<User>("SELECT * FROM users WHERE id = ?", a.id)!;
    fund(a, 2_000_00);
    const v = createVault(A(), { name: "Health", category: "health", target: 1_000_00 });
    deposit(A(), v, 500_00);

    const waiting = createWithdrawal(A(), v, 10_00, "Pharmacy");
    expect(() => payoutWithdrawal(A(), waiting, "test", "reviewer")).toThrow(/can't be paid: it is awaiting proof/);
    cancelWithdrawal(A(), waiting);
    expect(() => payoutWithdrawal(A(), waiting, "test", "reviewer")).toThrow(/cancelled/);

    const checked = createWithdrawal(A(), v, 20_00, "Clinic");
    run("UPDATE withdrawals SET status = 'verifying' WHERE id = ?", checked);
    expect(() => payoutWithdrawal(b, checked, "test", "reviewer")).toThrow(/not found/);
    payoutWithdrawal(A(), checked, "test", "reviewer");
    expect(get<{ status: string }>("SELECT status FROM withdrawals WHERE id = ?", checked)?.status).toBe("paid");
    expect(() => payoutWithdrawal(A(), checked, "test", "reviewer")).not.toThrow(); // paying twice stays a no-op
  });
});

/* ---------- Sign-up and closing an account (firebase mode) ---------- */

describe("sign-up and closing an account (firebase mode)", () => {
  const PROJECT = "vaultwise-mpin-test";
  let privateKey: CryptoKey;
  const token = (uid: string) =>
    new SignJWT({ email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "password" }, auth_time: Math.floor(Date.now() / 1000) })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  beforeAll(async () => {
    const kp = await generateKeyPair("RS256");
    privateKey = kp.privateKey;
    setVerificationKey(kp.publicKey);
    process.env.FIREBASE_PROJECT_ID = PROJECT;
  });
  afterAll(() => {
    setVerificationKey(null);
    delete process.env.FIREBASE_PROJECT_ID;
  });

  it("new accounts choose a 6-digit MPIN that passes the policy", async () => {
    const t = await token("mpin-uid");
    const four = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name: "Rhea Das", country: "IN", pin: "1234", demo: false } }));
    expect(four.status).toBe(400);
    expect((await four.json()).code).toBe("mpin_weak");
    const run6 = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name: "Rhea Das", country: "IN", pin: "123456", demo: false } }));
    expect((await run6.json()).code).toBe("mpin_weak");
    const ok = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name: "Rhea Das", country: "IN", pin: "482915", demo: false } }));
    expect(ok.status).toBe(200);
    const m = await (await call(getMe, req("/api/v1/me", { token: t }))).json();
    expect(m.mpin).toEqual({ upgradeDue: false, lockedUntil: null, enforced: true });
  });

  it("closing the account needs the MPIN", async () => {
    const t = await token("mpin-uid");
    const none = await call(resetRoute, req("/api/v1/reset", { token: t, method: "POST" }));
    expect(none.status).toBe(401);
    expect((await none.json()).code).toBe("mpin_required");
    const wrong = await call(resetRoute, req("/api/v1/reset", { token: t, body: { pin: "000000" } }));
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("mpin_wrong");
    expect(identityByUid("mpin-uid")!.status).toBe("active");
    const ok = await call(resetRoute, req("/api/v1/reset", { token: t, body: { pin: "482915" } }));
    expect(await ok.json()).toEqual({ ok: true, closed: true });
  });
});

describe("MPIN error answers", () => {
  it("send triesLeft and lockedUntil in the error JSON, next to error and code", async () => {
    const { MpinError } = await import("@/lib/mpin/verify");
    const { handle } = await import("@/lib/api");
    const wrong = handle(async () => {
      throw new MpinError(403, "That MPIN isn't right.", "mpin_wrong", { triesLeft: 3 });
    });
    const res = await wrong();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "That MPIN isn't right.", code: "mpin_wrong", triesLeft: 3 });
  });
});
