import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { all, get, newId, run } from "@/lib/db";
import { createUser, type User } from "@/lib/users";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { topUp } from "@/lib/wallet";
import { setVerificationKey } from "@/lib/auth/verify";
import { bindIdentity } from "@/lib/auth/identities";
import { ensureRecoveryTables } from "@/lib/recovery/claims";
import { listAlerts, pushTokensFor } from "@/lib/alerts";
import { setVerifiedPhone } from "@/lib/otp";
import {
  COOL_DOWN_MS,
  coolDownEnds,
  deviceContext,
  isTrusted,
  MAX_ACTIVE_DEVICES,
  NEW_ACCOUNT_WINDOW_MS,
  NEW_DEVICES_PER_HOUR,
  readDeviceHeaders,
  signedInBefore,
  touchDevice,
  trustableAtOf,
  untrustedMoveCap,
} from "@/lib/devices";
import { MONEY_ROUTES } from "@/lib/money-routes";
import { GET as getMe } from "@/app/api/v1/me/route";
import { POST as onboard } from "@/app/api/v1/onboarding/route";
import { GET as listDevicesRoute } from "@/app/api/v1/devices/route";
import { POST as trustRoute } from "@/app/api/v1/devices/trust/route";
import { POST as revokeRoute } from "@/app/api/v1/devices/[id]/revoke/route";
import { POST as spendRoute } from "@/app/api/v1/wallet/spend/route";
import { POST as cashOutRoute } from "@/app/api/v1/wallet/cash-out/route";
import { POST as moveRoute } from "@/app/api/v1/wallet/move/route";
import { POST as emergencyRoute } from "@/app/api/v1/emergency/withdrawals/route";
import { POST as withdrawRoute } from "@/app/api/v1/vaults/[id]/withdrawals/route";
import { POST as sendOtpRoute } from "@/app/api/v1/otp/send/route";
import { POST as verifyOtpRoute } from "@/app/api/v1/otp/verify/route";
import { POST as pushRegister } from "@/app/api/v1/push/register/route";
import { POST as createVaultRoute } from "@/app/api/v1/vaults/route";

/* ---------- Helpers ---------- */

const HOUR = 3_600_000;
const PIN = "482915";
const PHONE_A = "dev-phone-aaaa-0001";
const PHONE_B = "dev-phone-bbbb-0002";
const PHONE_C = "dev-phone-cccc-0003";

type Opts = { device?: string; platform?: string; version?: string; token?: string; method?: string; body?: unknown };

function req(path: string, opts: Opts = {}) {
  const headers: Record<string, string> = {};
  if (opts.device) headers["x-device-id"] = opts.device;
  if (opts.platform) headers["x-device-platform"] = opts.platform;
  if (opts.version) headers["x-app-version"] = opts.version;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const call = (h: unknown, request?: Request, context?: unknown) => (h as (...a: unknown[]) => Promise<Response>)(request, context);
const me = (opts: Opts = {}) => call(getMe, req("/api/v1/me", opts));
const spend = (amount: number, opts: Opts = {}) => call(spendRoute, req("/api/v1/wallet/spend", { ...opts, body: { amount, payee: "Corner shop", pin: PIN } }));

function fund(u: User, amount: number) {
  transfer({ userId: u.id, from: worldAccount(u.currency).id, to: userAccount(u.id, "bank", u.currency).id, amount, kind: "income", memo: "seed" });
}

const deviceRow = (installId: string) =>
  get<{ id: string; first_seen: number; last_seen: number; trusted_at: number | null; revoked_at: number | null; platform: string | null; app_version: string | null }>(
    "SELECT * FROM devices WHERE install_id = ?",
    installId,
  )!;

// Prototype mode: the first user is the customer every route acts for.
const main = createUser({ name: "Dev Ice", jurisdiction: "US", pin: PIN, createdAt: Date.now() - HOUR });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", main.id)!;
fund(main, 5_000_00);
topUp(main, 2_000_00);

afterEach(() => {
  delete process.env.DEVICES_ENFORCED;
  delete process.env.OTP_MODE;
});

/* ---------- Pure rules ---------- */

describe("device rules", () => {
  it("reads the device headers, treating a missing, 'unknown' or malformed id as no device", () => {
    const h = (v: Record<string, string>) => readDeviceHeaders(new Headers(v));
    expect(h({})).toEqual({ installId: null, platform: null, appVersion: null });
    expect(h({ "x-device-id": "unknown" }).installId).toBeNull();
    expect(h({ "x-device-id": "short" }).installId).toBeNull();
    expect(h({ "x-device-id": "has spaces in it" }).installId).toBeNull();
    expect(h({ "x-device-id": "7f0c1a52-1b8e-4e7d-9f3a-2d6c8b9e0a11", "x-device-platform": "Android", "x-app-version": "1.4.0" })).toEqual({
      installId: "7f0c1a52-1b8e-4e7d-9f3a-2d6c8b9e0a11",
      platform: "android",
      appVersion: "1.4.0",
    });
    expect(h({ "x-device-platform": "blackberry", "x-app-version": "<script>" })).toMatchObject({ platform: null, appVersion: null });
  });

  it("caps untrusted moves at USD 50, scaled per currency to a whole unit", () => {
    expect(untrustedMoveCap({ currency: "USD" })).toBe(50_00);
    expect(untrustedMoveCap({ currency: "INR" })).toBe(4_000_00);
    expect(untrustedMoveCap({ currency: "EUR" })).toBe(48_00);
    expect(untrustedMoveCap({ currency: "GBP" })).toBe(40_00);
    expect(untrustedMoveCap({ currency: "XYZ" })).toBe(50_00);
  });

  it("trusts a device once trusted, or 24 hours after first seen; never once signed out", () => {
    const t0 = 1_000_000;
    const d = { firstSeen: t0, trustedAt: null, revokedAt: null };
    expect(coolDownEnds(d)).toBe(t0 + COOL_DOWN_MS);
    expect(isTrusted(d, t0 + COOL_DOWN_MS - 1)).toBe(false);
    expect(isTrusted(d, t0 + COOL_DOWN_MS)).toBe(true);
    expect(isTrusted({ ...d, trustedAt: t0 + 5 }, t0 + 10)).toBe(true);
    expect(isTrusted({ ...d, trustedAt: t0, revokedAt: t0 + 1 }, t0 + 2)).toBe(false);
  });

  it("never lets a device first seen after a sign-out cool down, and compares sign-in times in whole seconds", () => {
    const t0 = 1_000_000;
    const d = { firstSeen: t0, trustedAt: null, revokedAt: null, coolsDown: false };
    expect(isTrusted(d, t0 + COOL_DOWN_MS * 10)).toBe(false);
    expect(trustableAtOf(d, t0)).toBeNull();
    expect(trustableAtOf({ ...d, coolsDown: true }, t0)).toBe(t0 + COOL_DOWN_MS);
    expect(isTrusted({ ...d, trustedAt: t0 + 1 }, t0 + 2)).toBe(true);
    expect(signedInBefore(10_000, 11_000)).toBe(true);
    expect(signedInBefore(10_000, 10_999)).toBe(false); // the same second as the sign-out
    expect(signedInBefore(12_000, 11_000)).toBe(false);
  });

  it("marks the money-out actions for the cap (and only those)", () => {
    const capped = Object.entries(MONEY_ROUTES)
      .filter(([, p]) => (p as { deviceCap?: boolean }).deviceCap)
      .map(([a]) => a)
      .sort();
    expect(capped).toEqual(["emergency", "wallet_cash_out", "wallet_spend", "withdraw"]);
  });
});

/* ---------- Registration ---------- */

describe("registering devices (prototype mode)", () => {
  it("treats a request without a device id as the account's own trusted context, and records nothing", async () => {
    const m = await (await me()).json();
    expect(m.device).toEqual({ registered: false, trusted: true, trustableAt: null });
    expect(get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'") ? all("SELECT * FROM devices") : []).toHaveLength(0);
  });

  it("trusts the account's first device at once, without a new-device alert", async () => {
    const m = await (await me({ device: PHONE_A, platform: "ios", version: "1.0.0" })).json();
    expect(m.device).toEqual({ registered: true, trusted: true, trustableAt: null });
    const row = deviceRow(PHONE_A);
    expect(row.trusted_at).toBe(row.first_seen);
    expect(row).toMatchObject({ platform: "ios", app_version: "1.0.0", revoked_at: null });
    expect(listAlerts(main.id).filter((a) => a.kind === "new_device")).toHaveLength(0);
  });

  it("starts a later device untrusted for 24 hours, audits it and alerts the person", async () => {
    const m = await (await me({ device: PHONE_B, platform: "android", version: "1.0.0" })).json();
    const row = deviceRow(PHONE_B);
    expect(row.trusted_at).toBeNull();
    expect(m.device).toEqual({ registered: true, trusted: false, trustableAt: row.first_seen + COOL_DOWN_MS });
    const alerts = listAlerts(main.id).filter((a) => a.kind === "new_device");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain("an Android phone");
    const audits = all<{ details: string }>("SELECT details FROM audit_log WHERE action = 'device.registered' AND user_id = ?", main.id);
    expect(audits.map((a) => JSON.parse(a.details).trusted)).toEqual([true, false]);
    // Seen again: no second row, no second alert.
    await me({ device: PHONE_B, platform: "android" });
    expect(all("SELECT * FROM devices WHERE install_id = ?", PHONE_B)).toHaveLength(1);
    expect(listAlerts(main.id).filter((a) => a.kind === "new_device")).toHaveLength(1);
  });

  it("keeps last_seen current at most once a minute, and the app version always", async () => {
    run("UPDATE devices SET last_seen = ? WHERE install_id = ?", Date.now() - 30_000, PHONE_A);
    const before = deviceRow(PHONE_A).last_seen;
    await me({ device: PHONE_A });
    expect(deviceRow(PHONE_A).last_seen).toBe(before);
    await me({ device: PHONE_A, version: "1.1.0" });
    expect(deviceRow(PHONE_A)).toMatchObject({ app_version: "1.1.0", platform: "ios" });
    expect(deviceRow(PHONE_A).last_seen).toBeGreaterThan(before);
  });

  it("lists the signed-in devices, marking the current one", async () => {
    const r = await (await call(listDevicesRoute, req("/api/v1/devices", { device: PHONE_B }))).json();
    expect(r.devices).toHaveLength(2);
    const a = r.devices.find((d: { platform: string }) => d.platform === "ios");
    const b = r.devices.find((d: { platform: string }) => d.platform === "android");
    expect(a).toMatchObject({ trusted: true, trustableAt: null, current: false, appVersion: "1.1.0" });
    expect(b).toMatchObject({ trusted: false, current: true, appVersion: "1.0.0" });
    expect(b.trustableAt).toBe(deviceRow(PHONE_B).first_seen + COOL_DOWN_MS);
    expect(Object.keys(b).sort()).toEqual(["appVersion", "current", "firstSeen", "id", "lastSeen", "platform", "trustableAt", "trusted"]);
  });
});

/* ---------- The money-out cap ---------- */

describe("the untrusted-device cap", () => {
  it("lets an untrusted device move up to USD 50 per move, and refuses more with trustableAt", async () => {
    expect((await spend(50, { device: PHONE_B })).status).toBe(201);
    const over = await spend(50.01, { device: PHONE_B });
    expect(over.status).toBe(403);
    const j = await over.json();
    expect(j.code).toBe("device_untrusted");
    expect(j.trustableAt).toBe(deviceRow(PHONE_B).first_seen + COOL_DOWN_MS);
    expect(j.error).toMatch(/up to \$50 at a time for the next (23|24) hours/);
  });

  it("applies to cash-outs, vault withdrawals and emergencies, but not to moves into a vault", async () => {
    const cash = await call(cashOutRoute, req("/api/v1/wallet/cash-out", { device: PHONE_B, body: { amount: 60, pin: PIN } }));
    expect((await cash.json()).code).toBe("device_untrusted");
    const v = await call(createVaultRoute, req("/api/v1/vaults", { body: { name: "Clinic", category: "health", target: 500 } }));
    const { id } = await v.json();
    const w = await call(withdrawRoute, req(`/api/v1/vaults/${id}/withdrawals`, { device: PHONE_B, body: { amount: 60, payee: "Clinic", pin: PIN } }), ctx({ id }));
    expect((await w.json()).code).toBe("device_untrusted");
    const e = await call(emergencyRoute, req("/api/v1/emergency/withdrawals", { device: PHONE_B, body: { amount: 60, reasonCode: "medical", attest: true, pin: PIN } }));
    expect((await e.json()).code).toBe("device_untrusted");
    const move = await call(moveRoute, req("/api/v1/wallet/move", { device: PHONE_B, body: { vaultId: id, amount: 60, pin: PIN } }));
    expect(move.status).toBe(201);
  });

  it("doesn't apply to the trusted device or to the web app's unidentified requests (prototype mode)", async () => {
    expect((await spend(60, { device: PHONE_A })).status).toBe(201);
    expect((await spend(60)).status).toBe(201);
  });

  it("lifts 24 hours after the device was first seen", async () => {
    run("UPDATE devices SET first_seen = ? WHERE install_id = ?", Date.now() - COOL_DOWN_MS - 1000, PHONE_B);
    expect((await spend(60, { device: PHONE_B })).status).toBe(201);
    expect((await (await me({ device: PHONE_B })).json()).device).toEqual({ registered: true, trusted: true, trustableAt: null });
    run("UPDATE devices SET first_seen = ? WHERE install_id = ?", Date.now() - HOUR, PHONE_B);
  });

  it("is off with DEVICES_ENFORCED=false", async () => {
    process.env.DEVICES_ENFORCED = "false";
    expect((await spend(60, { device: PHONE_B })).status).toBe(201);
  });
});

/* ---------- Trusting with a texted code and the MPIN ---------- */

describe("trusting a device", () => {
  const trust = (body: unknown, device = PHONE_B) => call(trustRoute, req("/api/v1/devices/trust", { device, body }));

  async function codeFor(purpose: string, device = PHONE_B, phone?: string) {
    const sent = await (await call(sendOtpRoute, req("/api/v1/otp/send", { device, body: { purpose, phone } }))).json();
    const v = await (await call(verifyOtpRoute, req("/api/v1/otp/verify", { device, body: { otpId: sent.otpId, code: sent.testCode } }))).json();
    return v.verificationToken as string;
  }

  beforeAll(() => setVerifiedPhone(main, "+15551230001"));

  it("needs a registered device, the MPIN and a device_trust token", async () => {
    process.env.OTP_MODE = "test";
    expect((await call(trustRoute, req("/api/v1/devices/trust", { body: { verificationToken: "x", pin: PIN } }))).status).toBe(400);
    expect((await (await call(trustRoute, req("/api/v1/devices/trust", { body: { verificationToken: "x", pin: PIN } }))).json()).code).toBe("device_unknown");
    const token = await codeFor("device_trust");
    expect((await (await trust({ verificationToken: token })).json()).code).toBe("mpin_required");
    expect((await (await trust({ verificationToken: token, pin: "000000" })).json()).code).toBe("mpin_wrong");
    expect((await (await trust({ verificationToken: "not-a-token", pin: PIN })).json()).code).toBe("verification_invalid");
    // A token for another purpose (here: verifying a phone, from the trusted phone) doesn't trust a device.
    const other = await codeFor("phone_verify", PHONE_A, "+15551230001");
    expect((await (await trust({ verificationToken: other, pin: PIN })).json()).code).toBe("verification_invalid");
    expect(deviceRow(PHONE_B).trusted_at).toBeNull();
  });

  it("trusts the calling device, lifts the cap and alerts the person", async () => {
    process.env.OTP_MODE = "test";
    const token = await codeFor("device_trust");
    const r = await trust({ verificationToken: token, pin: PIN });
    expect(await r.json()).toEqual({ ok: true });
    expect(deviceRow(PHONE_B).trusted_at).not.toBeNull();
    expect((await spend(60, { device: PHONE_B })).status).toBe(201);
    expect(listAlerts(main.id).some((a) => a.kind === "device_trusted")).toBe(true);
    // The token was used up.
    expect((await (await trust({ verificationToken: token, pin: PIN }, PHONE_C)).json()).code).toBe("verification_invalid");
  });

  it("refuses device_trust codes for requests without a device id", async () => {
    process.env.OTP_MODE = "test";
    const r = await call(sendOtpRoute, req("/api/v1/otp/send", { body: { purpose: "device_trust" } }));
    expect((await r.json()).code).toBe("device_unknown");
  });
});

/* ---------- Signing devices out ---------- */

describe("signing devices out", () => {
  const revoke = (id: string, device: string | undefined, pin: string | null = PIN) =>
    call(revokeRoute, req(`/api/v1/devices/${id}/revoke`, { device, body: pin === null ? {} : { pin } }), ctx({ id }));

  it("needs the MPIN, and only finds this account's devices", async () => {
    const a = deviceRow(PHONE_A);
    expect((await (await revoke(a.id, PHONE_A, null)).json()).code).toBe("mpin_required");
    expect((await revoke("dev_nope", PHONE_A)).status).toBe(404);
    expect((await (await revoke("dev_nope", PHONE_A)).json()).code).toBe("device_not_found");
  });

  it("won't let a new device sign out a trusted one, but lets it sign itself out", async () => {
    await me({ device: PHONE_C, platform: "android" });
    const a = deviceRow(PHONE_A);
    const c = deviceRow(PHONE_C);
    const refused = await revoke(a.id, PHONE_C);
    expect(refused.status).toBe(403);
    const j = await refused.json();
    expect(j).toMatchObject({ code: "device_untrusted", trustableAt: c.first_seen + COOL_DOWN_MS });
    expect(deviceRow(PHONE_A).revoked_at).toBeNull();

    expect(await (await revoke(c.id, PHONE_C)).json()).toEqual({ ok: true });
    expect(deviceRow(PHONE_C).revoked_at).not.toBeNull();
  });

  it("refuses every later request from a signed-out device with 401 device_revoked", async () => {
    const r = await me({ device: PHONE_C });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "This device was signed out of your account. Sign in again on a device you trust.", code: "device_revoked" });
    expect((await (await spend(1, { device: PHONE_C })).json()).code).toBe("device_revoked");
    expect((await (await call(listDevicesRoute, req("/api/v1/devices", { device: PHONE_C }))).json()).code).toBe("device_revoked");
    // Other devices are unaffected, and the signed-out one is no longer listed.
    const list = await (await call(listDevicesRoute, req("/api/v1/devices", { device: PHONE_A }))).json();
    expect(list.devices.map((d: { id: string }) => d.id)).not.toContain(deviceRow(PHONE_C).id);
  });

  it("lets a trusted device sign out another, removing its push tokens and alerting the person", async () => {
    const b = deviceRow(PHONE_B);
    const token = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
    expect((await call(pushRegister, req("/api/v1/push/register", { device: PHONE_B, body: { token, platform: "android" } }))).status).toBe(200);
    expect(pushTokensFor(main.id).map((t) => t.token)).toContain(token);
    expect(await (await revoke(b.id, PHONE_A)).json()).toEqual({ ok: true });
    expect(pushTokensFor(main.id).map((t) => t.token)).not.toContain(token);
    expect((await me({ device: PHONE_B })).status).toBe(401);
    expect(listAlerts(main.id).filter((a) => a.kind === "device_revoked").length).toBeGreaterThanOrEqual(2);
    // Signing out twice is a no-op.
    expect(await (await revoke(b.id, PHONE_A)).json()).toEqual({ ok: true });
  });

  it("lets a signed-out device back in with DEVICES_ENFORCED=false", async () => {
    process.env.DEVICES_ENFORCED = "false";
    expect((await me({ device: PHONE_B })).status).toBe(200);
  });
});

/* ---------- The new-device limit (any mode) ---------- */

describe("the new-device limit", () => {
  const headers = (id: string) => new Headers({ "x-device-id": id, "x-device-platform": "android" });
  const rowsFor = (userId: string) => get<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE user_id = ?", userId)!.n;
  const newDeviceAlerts = (userId: string) => listAlerts(userId).filter((a) => a.kind === "new_device").length;

  it("records at most 5 new devices an hour; past it a new id isn't recorded, raises no alert and is untrusted", () => {
    const u = createUser({ name: "Cap Carla", jurisdiction: "US", pin: PIN });
    for (let i = 0; i < NEW_DEVICES_PER_HOUR; i++) expect(touchDevice(u, headers(`cap-dev-${i}-aaaa`)).device).not.toBeNull();
    expect(rowsFor(u.id)).toBe(5);
    expect(newDeviceAlerts(u.id)).toBe(4); // the first was the sign-up device
    const over = touchDevice(u, headers("cap-dev-5-aaaa"));
    expect(over).toEqual({ device: null, trusted: false, trustableAt: null }); // untrusted even in prototype mode
    expect(deviceContext(u, headers("cap-dev-5-aaaa"))).toEqual({ device: null, trusted: false, trustableAt: null });
    expect(rowsFor(u.id)).toBe(5);
    expect(newDeviceAlerts(u.id)).toBe(4);
    // Rotating ids doesn't add rows or alerts either.
    for (let i = 6; i < 12; i++) touchDevice(u, headers(`cap-dev-${i}-aaaa`));
    expect(rowsFor(u.id)).toBe(5);
    // Devices already recorded keep working, and an hour later there is room again.
    expect(touchDevice(u, headers("cap-dev-0-aaaa")).device).not.toBeNull();
    expect(touchDevice(u, headers("cap-dev-5-aaaa"), { now: Date.now() + HOUR + 1000 }).device).not.toBeNull();
  });

  it("keeps at most 20 devices signed in at once", () => {
    const u = createUser({ name: "Cap Cyrus", jurisdiction: "US", pin: PIN });
    touchDevice(u, headers("full-dev-first"));
    const old = Date.now() - 3 * HOUR;
    for (let i = 1; i < MAX_ACTIVE_DEVICES; i++)
      run(
        "INSERT INTO devices (id, user_id, install_id, platform, app_version, first_seen, last_seen, trusted_at, revoked_at, cool_down) VALUES (?, ?, ?, 'ios', NULL, ?, ?, NULL, NULL, 1)",
        `dev_full_${i}`,
        u.id,
        `full-dev-${i}-xxxx`,
        old,
        old,
      );
    expect(touchDevice(u, headers("full-dev-new1")).device).toBeNull();
    run("UPDATE devices SET revoked_at = ? WHERE id = 'dev_full_1'", Date.now());
    expect(touchDevice(u, headers("full-dev-new1")).device).not.toBeNull();
  });

  it("trusts the first device of a wallet opened in the last hour, even with back-dated practice data", () => {
    // The practice data back-dates users.created_at by months; the wallet's ledger account says when it was really opened.
    const demo = createUser({ name: "Demo Dana", jurisdiction: "US", pin: PIN, createdAt: Date.now() - 120 * 24 * HOUR });
    expect(touchDevice(demo, headers("demo-dev-first")).trusted).toBe(true);
  });

  it("starts the first device of an older wallet untrusted (with sign-in on), with the cool-down and a new_device alert", () => {
    const u = createUser({ name: "Old Olga", jurisdiction: "US", pin: PIN });
    run("UPDATE accounts SET created_at = ? WHERE user_id = ?", Date.now() - NEW_ACCOUNT_WINDOW_MS - 60_000, u.id);
    vi.stubEnv("FIREBASE_PROJECT_ID", "vaultwise-devices-test"); // the rule guards real sign-ins
    try {
      const ctx = touchDevice(u, headers("old-dev-first"));
      expect(ctx.trusted).toBe(false);
      expect(ctx.trustableAt).toBe(ctx.device!.firstSeen + COOL_DOWN_MS);
      expect(newDeviceAlerts(u.id)).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps trusting the first device of an older wallet in prototype mode (no sign-in), but not the next", () => {
    const u = createUser({ name: "Old Oscar", jurisdiction: "US", pin: PIN });
    run("UPDATE accounts SET created_at = ? WHERE user_id = ?", Date.now() - NEW_ACCOUNT_WINDOW_MS - 60_000, u.id);
    expect(touchDevice(u, headers("proto-dev-first")).trusted).toBe(true);
    expect(touchDevice(u, headers("proto-dev-second")).trusted).toBe(false);
    expect(newDeviceAlerts(u.id)).toBe(1);
  });
});

/* ---------- Sign-in on (firebase mode) ---------- */

describe("devices with sign-in on (firebase mode)", () => {
  const PROJECT = "vaultwise-devices-test";
  const nowSec = () => Math.floor(Date.now() / 1000);
  let privateKey: CryptoKey;
  const token = (uid: string, authTime = nowSec()) =>
    new SignJWT({ email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "password" }, auth_time: authTime })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  async function signUp(uid: string, name: string, authTime?: number) {
    const t = await token(uid, authTime);
    const ok = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name, country: "US", pin: PIN, demo: false } }));
    expect(ok.status).toBe(200);
    const id = get<{ user_id: string }>("SELECT user_id FROM identities WHERE uid = ?", uid)!.user_id;
    const user = () => get<User>("SELECT * FROM users WHERE id = ?", id)!;
    fund(user(), 1_000_00);
    topUp(user(), 500_00);
    return { t, user };
  }

  beforeAll(async () => {
    const kp = await generateKeyPair("RS256");
    privateKey = kp.privateKey;
    setVerificationKey(kp.publicKey);
    process.env.FIREBASE_PROJECT_ID = PROJECT;
    process.env.KYC_ENFORCED = "false";
  });
  afterAll(() => {
    setVerificationKey(null);
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.KYC_ENFORCED;
    delete process.env.RATE_LIMIT_PER_MINUTE;
  });

  it("treats a request without a device id as untrusted from the start, and never cooling down", async () => {
    const { t } = await signUp("dev-uid", "Ira Sen");
    expect((await (await me({ token: t })).json()).device).toEqual({ registered: false, trusted: false, trustableAt: null });
    const over = await spend(60, { token: t });
    expect(over.status).toBe(403);
    expect(await over.json()).toMatchObject({ code: "device_untrusted", trustableAt: null });
    expect((await spend(50, { token: t })).status).toBe(201);

    // The phone that signed up sends its id: the new account's first device, trusted at once.
    expect((await (await me({ token: t, device: "fb-phone-0000-0001" })).json()).device).toEqual({ registered: true, trusted: true, trustableAt: null });
    expect((await spend(60, { token: t, device: "fb-phone-0000-0001" })).status).toBe(201);
    // Leaving the header off is still untrusted.
    expect((await spend(60, { token: t })).status).toBe(403);
  });

  it("ends older sign-ins when a device is signed out, except on trusted devices", async () => {
    const OWNER = "rev-phone-0000-0001";
    const THIEF = "rev-phone-0000-0002";
    const OTHER = "rev-phone-0000-0003";
    const old = nowSec() - 120;
    const { t: oldToken, user } = await signUp("rev-uid", "Rhea Varma", old);
    expect((await (await me({ token: oldToken, device: OWNER })).json()).device.trusted).toBe(true);
    expect((await (await me({ token: oldToken, device: THIEF })).json()).device.trusted).toBe(false);
    expect((await (await me({ token: oldToken, device: OTHER })).json()).device.trusted).toBe(false);
    const thief = deviceRow(THIEF);
    const revoked = await call(revokeRoute, req(`/api/v1/devices/${thief.id}/revoke`, { token: oldToken, device: OWNER, body: { pin: PIN } }), ctx({ id: thief.id }));
    expect(await revoked.json()).toEqual({ ok: true });
    const revokedAt = get<{ t: number }>("SELECT devices_revoked_at AS t FROM users WHERE id = ?", user().id)!.t;
    expect(revokedAt).toBeGreaterThan(old * 1000);

    // The stolen sign-in: its device is signed out, and a new id or no id doesn't get it back in.
    expect(await (await me({ token: oldToken, device: THIEF })).json()).toMatchObject({ code: "device_revoked" });
    const alertsBefore = listAlerts(user().id).filter((a) => a.kind === "new_device").length;
    const fresh = await me({ token: oldToken, device: "rev-phone-0000-0009" });
    expect(fresh.status).toBe(401);
    expect(await fresh.json()).toMatchObject({ code: "signed_out" });
    expect(get("SELECT 1 FROM devices WHERE install_id = 'rev-phone-0000-0009'")).toBeUndefined();
    expect(listAlerts(user().id).filter((a) => a.kind === "new_device").length).toBe(alertsBefore);
    expect(await (await me({ token: oldToken })).json()).toMatchObject({ code: "signed_out" });
    expect((await spend(1, { token: oldToken })).status).toBe(401);
    // An untrusted device from before the sign-out must sign in again too.
    expect(await (await me({ token: oldToken, device: OTHER })).json()).toMatchObject({ code: "signed_out" });

    // The owner's trusted phone keeps its sign-in.
    expect((await me({ token: oldToken, device: OWNER })).status).toBe(200);
    expect((await spend(60, { token: oldToken, device: OWNER })).status).toBe(201);

    // Signing in again works; a device from before the sign-out still cools down as usual.
    const newToken = await token("rev-uid");
    const other = await (await me({ token: newToken, device: OTHER })).json();
    expect(other.device).toEqual({ registered: true, trusted: false, trustableAt: deviceRow(OTHER).first_seen + COOL_DOWN_MS });

    // Rollback mode lets the old sign-in through.
    process.env.DEVICES_ENFORCED = "false";
    expect((await me({ token: oldToken })).status).toBe(200);
  });

  it("makes a device first seen after a sign-out wait for a texted code and the MPIN, not 24 hours", async () => {
    process.env.OTP_MODE = "test";
    const LATER = "rev-phone-0000-0004";
    const t = await token("rev-uid");
    const user = () => get<User>("SELECT u.* FROM users u JOIN identities i ON i.user_id = u.id WHERE i.uid = 'rev-uid'")!;
    const first = await (await me({ token: t, device: LATER })).json();
    expect(first.device).toEqual({ registered: true, trusted: false, trustableAt: null });
    // A day and more later it is still limited.
    run("UPDATE devices SET first_seen = ? WHERE install_id = ?", Date.now() - COOL_DOWN_MS - HOUR, LATER);
    expect((await (await me({ token: t, device: LATER })).json()).device).toEqual({ registered: true, trusted: false, trustableAt: null });
    const listed = (await (await call(listDevicesRoute, req("/api/v1/devices", { token: t, device: LATER }))).json()).devices.find((d: { current: boolean }) => d.current);
    expect(listed).toMatchObject({ trusted: false, trustableAt: null });
    const over = await spend(60, { token: t, device: LATER });
    expect(over.status).toBe(403);
    const j = await over.json();
    expect(j).toMatchObject({ code: "device_untrusted", trustableAt: null });
    expect(j.error).toMatch(/signed out of your account/);

    // A texted code and the MPIN trust it.
    run("UPDATE users SET phone = '+15551239999', phone_verified_at = ? WHERE id = ?", Date.now() - 100 * HOUR, user().id);
    const sent = await (await call(sendOtpRoute, req("/api/v1/otp/send", { token: t, device: LATER, body: { purpose: "device_trust" } }))).json();
    const v = await (await call(verifyOtpRoute, req("/api/v1/otp/verify", { token: t, device: LATER, body: { otpId: sent.otpId, code: sent.testCode } }))).json();
    const trusted = await call(trustRoute, req("/api/v1/devices/trust", { token: t, device: LATER, body: { verificationToken: v.verificationToken, pin: PIN } }));
    expect(await trusted.json()).toEqual({ ok: true });
    expect((await (await me({ token: t, device: LATER })).json()).device).toEqual({ registered: true, trusted: true, trustableAt: null });
  });

  it("never records a recovery claimant's device on the wallet it claims", async () => {
    const { user } = await signUp("claimed-uid", "Clara Moss");
    ensureRecoveryTables();
    bindIdentity({ uid: "claimant-uid", userId: user().id, email: "claimant-uid@example.com", provider: "password", status: "recovery_pending" });
    run(
      "INSERT INTO recovery_claims (id, claimant_uid, claimant_email, user_id, doc_type, status, provisional, created_at) VALUES (?, 'claimant-uid', 'claimant-uid@example.com', ?, 'passport', 'pending', 1, ?)",
      newId("rcl"),
      user().id,
      Date.now(),
    );
    const t = await token("claimant-uid");
    const r = await me({ token: t, device: "claimant-phone-0001" });
    expect(r.status).toBe(200);
    const m = await r.json();
    expect(m.auth.access).toBe("recovery");
    expect(m.device).toBeUndefined();
    expect(get("SELECT 1 FROM devices WHERE install_id = 'claimant-phone-0001'")).toBeUndefined();
  });

  it("applies the per-person rate limit to GET /me too", async () => {
    const { t } = await signUp("limit-uid", "Lim Ito");
    process.env.RATE_LIMIT_PER_MINUTE = "3";
    // A fixed one-minute window: 7 calls hit the limit of 3 even if a new minute starts on the way.
    const answers: number[] = [];
    for (let i = 0; i < 7; i++) answers.push((await me({ token: t, device: "limit-phone-0001" })).status);
    expect(answers[0]).toBe(200);
    expect(answers).toContain(429);
    delete process.env.RATE_LIMIT_PER_MINUTE;
  });
});

/* The main customer is still the prototype's first user. */
afterAll(() => {
  expect(fresh().id).toBe(main.id);
});
