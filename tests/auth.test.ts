import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { get, run } from "@/lib/db";
import { customer } from "@/lib/api";
import { setVerificationKey } from "@/lib/auth/verify";
import { bindIdentity, identityByUid } from "@/lib/auth/identities";
import { ensureRecoveryTables } from "@/lib/recovery/claims";
import { checkPin, type User } from "@/lib/users";
import { insertKycRecord } from "@/lib/kyc/store";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { topUp } from "@/lib/wallet";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/me/route";
import { GET as dashboard } from "@/app/api/v1/dashboard/route";
import { GET as activity } from "@/app/api/v1/activity/route";
import { POST as onboard } from "@/app/api/v1/onboarding/route";
import { GET as listVaults, POST as createVault } from "@/app/api/v1/vaults/route";
import { POST as withdraw } from "@/app/api/v1/vaults/[id]/withdrawals/route";
import { GET as overview } from "@/app/api/v1/admin/overview/route";
import { POST as reset } from "@/app/api/v1/reset/route";

const PROJECT = "vaultwise-auth-test";
let privateKey: CryptoKey;
let otherKey: CryptoKey;

async function token(uid: string, opts: { email?: string | null; verified?: boolean; key?: CryptoKey; audience?: string } = {}) {
  const email = opts.email === undefined ? `${uid}@example.com` : opts.email;
  return new SignJWT({ ...(email ? { email, email_verified: opts.verified ?? true } : {}), firebase: { sign_in_provider: "password" }, auth_time: Math.floor(Date.now() / 1000) })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.audience ?? PROJECT)
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(opts.key ?? privateKey);
}

function req(path: string, opts: { token?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
/** Calls a route handler the way Next does: (request, context). */
const call = (h: unknown, request?: Request, context?: unknown) => (h as (...a: unknown[]) => Promise<Response>)(request, context);
const VAULT = { name: "Clinic fund", category: "health", target: 500 };

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  privateKey = kp.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  setVerificationKey(kp.publicKey);
});

afterAll(() => {
  setVerificationKey(null);
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.ADMIN_EMAILS;
});

describe("prototype mode (no FIREBASE_PROJECT_ID)", () => {
  it("behaves as before: the first user is the customer, no sign-in", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    const before = await (await call(getMe)).json();
    expect(before.onboarded).toBe(false);
    expect(before.auth).toEqual({ mode: "prototype", access: "full", email: null });

    const r = await call(onboard, req("/api/v1/onboarding", { body: { name: "Proto Person", country: "US", pin: "1234", demo: false, email: "proto@example.com" } }));
    expect(r.status).toBe(200);
    const me = await (await call(getMe)).json();
    expect(me.onboarded).toBe(true);
    expect(me.auth).toEqual({ mode: "prototype", access: "full", email: "proto@example.com" });
    expect(me.kyc.status).toBe("verified"); // simulated check, as before

    // Lib code outside a request still resolves the first user.
    const u = await customer({ tick: false });
    expect(u.name).toBe("Proto Person");
    expect((await call(listVaults, req("/api/v1/vaults"))).status).toBe(200);

    const again = await call(onboard, req("/api/v1/onboarding", { body: { name: "Second", country: "US", pin: "1234", demo: false } }));
    expect(again.status).toBe(409);
  });

  it("still changes the PIN without the current one in prototype mode", async () => {
    const r = await call(patchMe, req("/api/v1/me", { method: "PATCH", body: { pin: "4321" } }));
    expect(r.status).toBe(200);
    expect(checkPin(get<User>("SELECT * FROM users ORDER BY created_at LIMIT 1")!, "4321")).toBe(true);
  });

  it("applies the KYC gate to the first user too", async () => {
    const u = get<User>("SELECT * FROM users ORDER BY created_at LIMIT 1")!;
    const v = await call(createVault, req("/api/v1/vaults", { body: VAULT }));
    const { id } = await v.json();
    run("UPDATE users SET kyc_status = 'pending' WHERE id = ?", u.id);
    const blocked = await call(withdraw, req(`/api/v1/vaults/${id}/withdrawals`, { body: { amount: 10, payee: "Clinic" } }), ctx({ id }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "kyc_required", error: "Verify your ID to move money." });
    run("UPDATE users SET kyc_status = 'verified' WHERE id = ?", u.id);
  });
});

describe("firebase mode", () => {
  beforeAll(() => {
    process.env.FIREBASE_PROJECT_ID = PROJECT;
    process.env.ADMIN_EMAILS = "Ops@Example.com, lead@example.com";
  });

  it("answers 401 signed_out without a valid token", async () => {
    const none = await call(listVaults, req("/api/v1/vaults"));
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: "Sign in to continue.", code: "signed_out" });

    const wrongKey = await call(listVaults, req("/api/v1/vaults", { token: await token("u1", { key: otherKey }) }));
    expect(wrongKey.status).toBe(401);
    const wrongAudience = await call(listVaults, req("/api/v1/vaults", { token: await token("u1", { audience: "someone-else" }) }));
    expect(wrongAudience.status).toBe(401);
    expect((await call(getMe)).status).toBe(401);
    // Lib code outside a request has no token either.
    await expect(customer()).rejects.toMatchObject({ status: 401, code: "signed_out" });
  });

  it("signed in with no wallet: 404 no_wallet, and /me says not onboarded", async () => {
    const t = await token("alice-uid", { email: "Alice@Example.com" });
    const r = await call(listVaults, req("/api/v1/vaults", { token: t }));
    expect(r.status).toBe(404);
    expect((await r.json()).code).toBe("no_wallet");
    const me = await (await call(getMe, req("/api/v1/me", { token: t }))).json();
    expect(me.onboarded).toBe(false);
    expect(me.auth).toEqual({ mode: "firebase", access: "full", email: "alice@example.com" });
  });

  it("onboarding binds the identity to a new wallet that starts KYC pending", async () => {
    const t = await token("alice-uid", { email: "alice@example.com" });
    const r = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name: "Alice Rao", country: "IN", pin: "1234", demo: false, email: "ignored@example.com" } }));
    expect(r.status).toBe(200);
    const identity = identityByUid("alice-uid")!;
    expect(identity.status).toBe("active");
    const user = get<User>("SELECT * FROM users WHERE id = ?", identity.user_id!)!;
    expect(user.email).toBe("alice@example.com"); // from the token
    expect(user.kyc_status).toBe("pending");

    const me = await (await call(getMe, req("/api/v1/me", { token: t }))).json();
    expect(me.onboarded).toBe(true);
    expect(me.user.id).toBe(user.id);
    expect(me.kyc).toEqual({ status: "not_started" });
    expect(me.auth.access).toBe("full");

    const again = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name: "Alice Rao", country: "IN", pin: "1234", demo: false } }));
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("has_wallet");
  });

  it("keeps wallets apart per identity", async () => {
    const bob = await token("bob-uid");
    await call(onboard, req("/api/v1/onboarding", { token: bob, body: { name: "Bob Lee", country: "US", pin: "1234", demo: false } }));
    await call(createVault, req("/api/v1/vaults", { token: bob, body: { ...VAULT, name: "Bob vault" } }));
    const alice = await token("alice-uid");
    const mine = await (await call(listVaults, req("/api/v1/vaults", { token: alice }))).json();
    expect(mine.vaults.map((v: { name: string }) => v.name)).not.toContain("Bob vault");
    const bobs = await (await call(listVaults, req("/api/v1/vaults", { token: bob }))).json();
    expect(bobs.vaults.map((v: { name: string }) => v.name)).toContain("Bob vault");
  });

  it("blocks money out until KYC is verified", async () => {
    const t = await token("alice-uid");
    const created = await call(createVault, req("/api/v1/vaults", { token: t, body: VAULT }));
    expect(created.status).toBe(201); // ordinary writes are fine
    const { id } = await created.json();
    const blocked = await call(withdraw, req(`/api/v1/vaults/${id}/withdrawals`, { token: t, body: { amount: 10, payee: "Clinic" } }), ctx({ id }));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("kyc_required");

    run("UPDATE users SET kyc_status = 'verified', kyc_level = 2 WHERE id = ?", identityByUid("alice-uid")!.user_id!);
    const allowed = await call(withdraw, req(`/api/v1/vaults/${id}/withdrawals`, { token: t, body: { amount: 10, payee: "Clinic" } }), ctx({ id }));
    expect(allowed.status).not.toBe(403);
  });

  it("recovery access opens only the summary routes", async () => {
    const userId = identityByUid("alice-uid")!.user_id!;
    bindIdentity({ uid: "claimant-uid", userId, email: "new@example.com", provider: "password", status: "recovery_pending" });
    ensureRecoveryTables();
    run(
      `INSERT INTO recovery_claims (id, claimant_uid, claimant_email, user_id, doc_type, id_last4, status, created_at) VALUES ('rcv_test', 'claimant-uid', 'new@example.com', ?, 'aadhaar', '1234', 'pending', ?)`,
      userId,
      Date.now(),
    );
    const t = await token("claimant-uid", { email: "new@example.com" });
    expect((await call(listVaults, req("/api/v1/vaults", { token: t }))).status).toBe(200);
    const w = await call(createVault, req("/api/v1/vaults", { token: t, body: VAULT }));
    expect(w.status).toBe(403);
    expect(await w.json()).toEqual({
      code: "recovery_restricted",
      error: "Your account is being checked. Money can't move until a person confirms it's you.",
    });
    const me = await (await call(getMe, req("/api/v1/me", { token: t }))).json();
    expect(me.auth.access).toBe("recovery");
    expect(me.recovery).toMatchObject({ claimId: "rcv_test", status: "pending" });
    expect(me.user).toMatchObject({ name: "Alice", email: "a***e@example.com" });
    expect((await call(dashboard, req("/api/v1/dashboard", { token: t }))).status).toBe(200);
    const read = await call(activity, req("/api/v1/activity", { token: t }));
    expect(read.status).toBe(403);
    expect((await read.json()).code).toBe("recovery_restricted");
    // The owner still sees everything.
    const owner = await (await call(getMe, req("/api/v1/me", { token: await token("alice-uid") }))).json();
    expect(owner.user).toMatchObject({ name: "Alice Rao", email: "alice@example.com" });
  });

  it("locks the name once an ID check verified it", async () => {
    const t = await token("alice-uid");
    const userId = identityByUid("alice-uid")!.user_id!;
    // Verified by the simulated check only (no ID record): the name can still change.
    expect((await call(patchMe, req("/api/v1/me", { token: t, method: "PATCH", body: { name: "Alice R" } }))).status).toBe(200);
    insertKycRecord({
      user_id: userId,
      doc_type: "pan",
      id_last4: "234F",
      id_hash: null,
      name_on_doc: "ALICE R",
      dob: null,
      status: "verified",
      provider: "practice",
      checks: [],
      reasons: [],
      file_path: null,
      decided_by: "kyc:practice",
      decided_at: Date.now(),
    });
    const locked = await call(patchMe, req("/api/v1/me", { token: t, method: "PATCH", body: { name: "Someone Else" } }));
    expect(locked.status).toBe(403);
    expect((await locked.json()).code).toBe("name_locked");
    expect((await call(patchMe, req("/api/v1/me", { token: t, method: "PATCH", body: { name: "Alice R" } }))).status).toBe(200);
  });

  it("asks for the current PIN before changing it", async () => {
    const t = await token("alice-uid");
    const userId = identityByUid("alice-uid")!.user_id!;
    const missing = await call(patchMe, req("/api/v1/me", { token: t, method: "PATCH", body: { pin: "5678" } }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).code).toBe("current_pin_required");
    const wrong = await call(patchMe, req("/api/v1/me", { token: t, method: "PATCH", body: { pin: "5678", currentPin: "0000" } }));
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).code).toBe("pin_mismatch");
    expect((await call(patchMe, req("/api/v1/me", { token: t, method: "PATCH", body: { pin: "5678", currentPin: "1234" } }))).status).toBe(200);
    expect(checkPin(get<User>("SELECT * FROM users WHERE id = ?", userId)!, "5678")).toBe(true);
  });

  it("counts the wallet in the dashboard even when the wallet is switched off", async () => {
    const t = await token("alice-uid");
    const user = get<User>("SELECT * FROM users WHERE id = ?", identityByUid("alice-uid")!.user_id!)!;
    transfer({ userId: user.id, from: worldAccount(user.currency).id, to: userAccount(user.id, "bank", user.currency).id, amount: 500_00, kind: "income", memo: "Salary" });
    topUp(user, 120_00);
    process.env.WALLET_ENABLED = "false";
    try {
      const d = await (await call(dashboard, req("/api/v1/dashboard", { token: t }))).json();
      expect(d.totals.wallet).toBe(120_00);
      expect(d.totals.netWorth).toBeGreaterThanOrEqual(120_00 + d.totals.bank);
    } finally {
      delete process.env.WALLET_ENABLED;
    }
  });

  it("practice-data sign-ups also start with KYC pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline")))); // synthetic market data
    try {
      const t = await token("demo-uid");
      const r = await call(onboard, req("/api/v1/onboarding", { token: t, body: { name: "Dee Mo", country: "US", pin: "1234", demo: true } }));
      expect(r.status).toBe(200);
      const user = get<User>("SELECT * FROM users WHERE id = ?", identityByUid("demo-uid")!.user_id!)!;
      expect(user).toMatchObject({ kyc_status: "pending", kyc_level: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  }, 60_000);

  it("admin routes need a verified email from ADMIN_EMAILS", async () => {
    expect((await call(overview, req("/api/v1/admin/overview"))).status).toBe(401);
    const notAdmin = await call(overview, req("/api/v1/admin/overview", { token: await token("alice-uid") }));
    expect(notAdmin.status).toBe(403);
    expect((await notAdmin.json()).code).toBe("admin_only");
    const unverified = await call(overview, req("/api/v1/admin/overview", { token: await token("ops-uid", { email: "ops@example.com", verified: false }) }));
    expect(unverified.status).toBe(403);
    const ok = await call(overview, req("/api/v1/admin/overview", { token: await token("ops-uid", { email: "ops@example.com" }) }));
    expect(ok.status).toBe(200);
  });

  it("reset closes the caller's account and keeps everyone else's data", async () => {
    const bob = await token("bob-uid");
    const bobUser = identityByUid("bob-uid")!.user_id!;
    const r = await call(reset, req("/api/v1/reset", { token: bob, method: "POST" }));
    expect(await r.json()).toEqual({ ok: true, closed: true });
    expect(identityByUid("bob-uid")!.status).toBe("disabled");
    expect(get<{ closed_at: number | null }>("SELECT closed_at FROM users WHERE id = ?", bobUser)!.closed_at).toBeTruthy();
    expect((await call(listVaults, req("/api/v1/vaults", { token: bob }))).status).toBe(404);
    // Data kept; other people unaffected.
    expect(get("SELECT 1 FROM vaults WHERE user_id = ?", bobUser)).toBeTruthy();
    expect((await call(listVaults, req("/api/v1/vaults", { token: await token("alice-uid") }))).status).toBe(200);
  });
});
