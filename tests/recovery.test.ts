import fs from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { generateKeyPair, SignJWT } from "jose";
import { all, get, run } from "@/lib/db";
import type { User } from "@/lib/users";
import { setVerificationKey } from "@/lib/auth/verify";
import { identityByUid } from "@/lib/auth/identities";
import { setIdExtractor } from "@/lib/kyc/analyse";
import { verhoeffDigit } from "@/lib/kyc/ids";
import { submitKyc } from "@/lib/kyc/service";
import { GLOBAL_KEY, LIMITS } from "@/lib/recovery/limits";
import { POST as onboard } from "@/app/api/v1/onboarding/route";
import { GET as getMe } from "@/app/api/v1/me/route";
import { GET as listVaults, POST as createVault } from "@/app/api/v1/vaults/route";
import { GET as vaultDetail } from "@/app/api/v1/vaults/[id]/route";
import { GET as dashboard } from "@/app/api/v1/dashboard/route";
import { GET as activity } from "@/app/api/v1/activity/route";
import { GET as exportData } from "@/app/api/v1/me/export/route";
import { GET as insight } from "@/app/api/v1/insight/route";
import { GET as kycStatus } from "@/app/api/v1/kyc/route";
import { POST as find } from "@/app/api/v1/recovery/find/route";
import { POST as resetPassword } from "@/app/api/v1/recovery/reset/route";
import { DELETE as cancelClaim, GET as getClaim, POST as claim } from "@/app/api/v1/recovery/claim/route";
import { GET as adminQueue } from "@/app/api/v1/admin/recovery/route";
import { POST as adminDecide } from "@/app/api/v1/admin/recovery/[id]/route";
import nextConfig from "../next.config";

const PROJECT = "vaultwise-recovery-test";
let privateKey: CryptoKey;

async function token(uid: string, email: string | null = `${uid}@example.com`) {
  return new SignJWT({ ...(email ? { email, email_verified: true } : {}), firebase: { sign_in_provider: "password" } })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

const call = (h: unknown, request?: Request, context?: unknown) => (h as (...a: unknown[]) => Promise<Response>)(request, context);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function jsonReq(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function authed(path: string, t: string, init: { method?: string; body?: unknown } = {}) {
  return new Request(`http://localhost${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${t}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

let seed = 0;
async function idImage() {
  seed++;
  return sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 200 + (seed % 50), g: 210, b: 220 } } })
    .jpeg()
    .toBuffer();
}
async function claimReq(t: string, idNumber: string | null, ip: string) {
  const form = new FormData();
  form.set("docType", "aadhaar");
  if (idNumber) form.set("idNumber", idNumber);
  form.set("file", new File([new Uint8Array(await idImage())], "id.jpg", { type: "image/jpeg" }));
  return new Request("http://localhost/api/v1/recovery/claim", { method: "POST", headers: { authorization: `Bearer ${t}`, "x-real-ip": ip }, body: form });
}

function aadhaar(n: number) {
  const base = String(34567890123 + n * 104_729).slice(0, 11);
  return base + verhoeffDigit(base);
}

/** The vision model "reads" this card. */
function cardReads(name: string, number: string) {
  setIdExtractor(async () => ({ is_id_document: true, doc_type: "aadhaar", name, dob: null, id_number: number, expiry: null, legibility: 0.9 }));
}

/** Opens a wallet for `uid` (bound identity) and verifies its Aadhaar. */
async function verifiedWallet(uid: string, email: string, name: string, number: string) {
  const r = await call(onboard, authed("/api/v1/onboarding", await token(uid, email), { body: { name, country: "IN", pin: "1234", demo: false } }));
  expect(r.status).toBe(200);
  const userId = identityByUid(uid)!.user_id!;
  cardReads(name, number);
  const view = await submitKyc(get<User>("SELECT * FROM users WHERE id = ?", userId)!, {
    docType: "aadhaar",
    file: { buffer: await idImage(), mime: "image/jpeg" },
    idNumber: number,
  });
  setIdExtractor(null);
  expect(view.status).toBe("verified");
  return userId;
}

const claimRow = (id: string) => get<{ file_path: string | null; provisional: number; status: string }>("SELECT file_path, provisional, status FROM recovery_claims WHERE id = ?", id)!;

const OWNER = aadhaar(1);
let ownerId = "";
let ops = "";

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  privateKey = kp.privateKey;
  setVerificationKey(kp.publicKey);
  process.env.FIREBASE_PROJECT_ID = PROJECT;
  process.env.ADMIN_EMAILS = "ops@example.com";
  process.env.IDENTITY_SECRET = "recovery-test-secret";
  ops = await token("ops-uid", "ops@example.com");
  ownerId = await verifiedWallet("owner-uid", "shaik@outlook.com", "Shaik Aayan Javed", OWNER);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setIdExtractor(null);
  delete process.env.FIREBASE_WEB_API_KEY;
  delete process.env.TRUST_PROXY_HOPS;
});

afterAll(() => {
  setVerificationKey(null);
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.ADMIN_EMAILS;
  delete process.env.IDENTITY_SECRET;
});

describe("find my account", () => {
  it("finds a verified ID and shows only a masked email", async () => {
    const r = await call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: `${OWNER.slice(0, 4)} ${OWNER.slice(4, 8)} ${OWNER.slice(8)}` }, { "x-real-ip": "10.0.0.1" }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ found: true, maskedEmail: "s***k@outlook.com", canReset: true });
    expect(typeof body.findToken).toBe("string");
    expect(JSON.stringify(body)).not.toContain("shaik@outlook.com");
  });

  it("says not found for an unknown ID, and 400 for a malformed one", async () => {
    const r = await call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: aadhaar(99) }, { "x-real-ip": "10.0.0.2" }));
    expect(await r.json()).toEqual({ found: false, canReset: false });
    const bad = await call(find, jsonReq("/api/v1/recovery/find", { docType: "pan", idNumber: "123" }, { "x-real-ip": "10.0.0.2" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("invalid_id");
  });

  it("allows 5 tries per hour per IP; rotating spoofable headers doesn't help; every try is audited", async () => {
    const before = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'recovery.find_attempt'")!.n;
    const tryOnce = (headers: Record<string, string>) => call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: aadhaar(50) }, headers));
    for (let i = 0; i < 5; i++) expect((await tryOnce({ "x-real-ip": "10.0.0.3", "x-device-id": `dev-${i}`, "x-forwarded-for": `1.1.1.${i}` })).status).toBe(200);
    const blocked = await tryOnce({ "x-real-ip": "10.0.0.3", "x-device-id": "dev-new", "x-forwarded-for": "9.9.9.9" });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("rate_limited");
    expect((await tryOnce({ "x-real-ip": "10.0.0.4" })).status).toBe(200);
    const after = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'recovery.find_attempt'")!.n;
    expect(after - before).toBe(6);
    const details = all<{ details: string }>("SELECT details FROM audit_log WHERE action = 'recovery.find_attempt'").map((r) => r.details).join("");
    expect(details).not.toContain(aadhaar(50));
    expect(details).not.toContain("10.0.0.3");
  });

  it("uses x-forwarded-for only behind a trusted proxy, and then its right-most hop", async () => {
    process.env.TRUST_PROXY_HOPS = "1";
    const tryOnce = (xff: string) => call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: aadhaar(51) }, { "x-forwarded-for": xff }));
    for (let i = 0; i < 5; i++) expect((await tryOnce(`6.6.6.${i}, 10.0.0.5`)).status).toBe(200);
    expect((await tryOnce("7.7.7.7, 10.0.0.5")).status).toBe(429); // spoofed left end ignored
    expect((await tryOnce("10.0.0.5, 10.0.0.6")).status).toBe(200);
  });

  it("a client with no IP header can't lock everyone out, but the server-wide cap still holds", async () => {
    const anon = () => call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: aadhaar(52) }));
    for (let i = 0; i < 7; i++) expect((await anon()).status).toBe(200);
    // Fill the server-wide budget for the hour.
    const now = Date.now();
    const used = get<{ n: number }>("SELECT COUNT(*) AS n FROM recovery_attempts WHERE bucket = 'find' AND client_key = ? AND ts > ?", GLOBAL_KEY, now - 3_600_000)!.n;
    for (let i = used; i < LIMITS.find.global; i++) run("INSERT INTO recovery_attempts (bucket, client_key, ts) VALUES ('find', ?, ?)", GLOBAL_KEY, now);
    const capped = await call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: aadhaar(52) }, { "x-real-ip": "10.0.0.99" }));
    expect(capped.status).toBe(429);
    run("DELETE FROM recovery_attempts WHERE bucket = 'find'");
  });

  it("refuses to run with sign-in on and no IDENTITY_SECRET", async () => {
    delete process.env.IDENTITY_SECRET;
    try {
      const r = await call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: OWNER }, { "x-real-ip": "10.0.0.7" }));
      expect(r.status).toBe(500);
      expect((await r.json()).code).toBe("server_config");
    } finally {
      process.env.IDENTITY_SECRET = "recovery-test-secret";
    }
  });
});

describe("password reset", () => {
  it("answers the same whether or not the email exists", async () => {
    process.env.FIREBASE_WEB_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "EMAIL_NOT_FOUND" } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const known = await call(resetPassword, jsonReq("/api/v1/recovery/reset", { email: "shaik@outlook.com" }, { "x-real-ip": "10.1.0.1" }));
    const unknown = await call(resetPassword, jsonReq("/api/v1/recovery/reset", { email: "nobody@example.com" }, { "x-real-ip": "10.1.0.1" }));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual({ ok: true });
    expect(await unknown.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("identitytoolkit.googleapis.com/v1/accounts:sendOobCode");
    expect(JSON.parse(String(init.body))).toEqual({ requestType: "PASSWORD_RESET", email: "shaik@outlook.com" });
  });

  it("sends to the found account's email with a findToken, without the client seeing it", async () => {
    process.env.FIREBASE_WEB_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const found = await (await call(find, jsonReq("/api/v1/recovery/find", { docType: "aadhaar", idNumber: OWNER }, { "x-real-ip": "10.1.0.2" }))).json();
    const r = await call(resetPassword, jsonReq("/api/v1/recovery/reset", { findToken: found.findToken }, { "x-real-ip": "10.1.0.2" }));
    expect(await r.json()).toEqual({ ok: true });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).email).toBe("shaik@outlook.com");
    const forged = await call(resetPassword, jsonReq("/api/v1/recovery/reset", { findToken: found.findToken.slice(0, -2) + "xx" }, { "x-real-ip": "10.1.0.2" }));
    expect(await forged.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is simulated in prototype mode", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    try {
      const r = await call(resetPassword, jsonReq("/api/v1/recovery/reset", { email: "a@b.co" }, { "x-real-ip": "10.1.0.3" }));
      expect(await r.json()).toEqual({ ok: true, simulated: true });
    } finally {
      process.env.FIREBASE_PROJECT_ID = PROJECT;
    }
  });
});

describe("recovery claims", () => {
  it("unreadable card (AI off): the claim waits for a person with no access, then approval binds the sign-in", async () => {
    const number = aadhaar(5);
    const uid = "g-claimant-uid";
    await verifiedWallet("g-owner-uid", "gita@example.com", "Gita Menon", number);
    const t = await token(uid, "gita.new@example.com");
    const res = await call(claim, await claimReq(t, number, "10.2.0.1"));
    expect(res.status).toBe(201);
    const { claim: c } = await res.json();
    expect(c).toMatchObject({ status: "pending", access: "after_approval" });
    expect(c.reasons).toContain("A person will check your ID before you can see the account.");
    expect(identityByUid(uid)).toMatchObject({ user_id: null, status: "active" });
    expect((await call(listVaults, authed("/api/v1/vaults", t))).status).toBe(404);
    expect((await (await call(getMe, authed("/api/v1/me", t))).json()).onboarded).toBe(false);
    expect((await (await call(getClaim, authed("/api/v1/recovery/claim", t))).json()).claim).toMatchObject({ id: c.id, access: "after_approval" });

    // One pending claim at a time, and no new wallet while it waits.
    const again = await call(claim, await claimReq(t, number, "10.2.0.1"));
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("claim_pending");
    const open = await call(onboard, authed("/api/v1/onboarding", t, { body: { name: "Gita", country: "IN", pin: "1234", demo: false } }));
    expect((await open.json()).code).toBe("claim_pending");

    await call(adminDecide, authed(`/api/v1/admin/recovery/${c.id}`, ops, { body: { decision: "approved", note: "Checked by phone" } }), ctx(c.id));
    expect(identityByUid(uid)!.status).toBe("active");
    expect(identityByUid(uid)!.user_id).toBe(identityByUid("g-owner-uid")!.user_id);
    expect((await call(createVault, authed("/api/v1/vaults", t, { body: { name: "Back in", category: "health", target: 100 } }))).status).toBe(201);
    expect(claimRow(c.id).file_path).toBeTruthy(); // approved claims keep the photo
  });

  it("a typed number that differs from the card gives no provisional access", async () => {
    cardReads("Shaik Aayan Javed", aadhaar(77));
    const t = await token("h-claimant-uid");
    const res = await call(claim, await claimReq(t, OWNER, "10.2.0.2"));
    const { claim: c } = await res.json();
    expect(c.access).toBe("after_approval");
    expect(identityByUid("h-claimant-uid")!.user_id).toBeNull();
    await call(cancelClaim, authed("/api/v1/recovery/claim", t, { method: "DELETE" }));
  });

  it("clean card: read-only summary only (masked /me, dashboard, vault list), then approve → full access", async () => {
    cardReads("Shaik Aayan Javed", OWNER);
    const t = await token("new-uid", "shaik.new@gmail.com");
    const res = await call(claim, await claimReq(t, OWNER, "10.2.0.3"));
    expect(res.status).toBe(201);
    const { claim: c } = await res.json();
    expect(c).toMatchObject({ status: "pending", access: "read_only", docType: "aadhaar", idLast4: OWNER.slice(-4), notifiedEmail: "s***k@outlook.com" });
    expect(c.expiresAt - c.createdAt).toBe(7 * 86_400_000);
    expect(identityByUid("new-uid")).toMatchObject({ user_id: ownerId, status: "recovery_pending" });
    expect(get("SELECT 1 FROM audit_log WHERE action = 'notice.recovery_started' AND user_id = ?", ownerId)).toBeTruthy();

    // The allowlist.
    const me = await (await call(getMe, authed("/api/v1/me", t))).json();
    expect(me.auth).toEqual({ mode: "firebase", access: "recovery", email: "shaik.new@gmail.com" });
    expect(me.user).toMatchObject({ name: "Shaik", email: "s***k@outlook.com", riskProfile: null });
    expect(me.recovery).toMatchObject({ claimId: c.id, status: "pending" });
    expect((await call(listVaults, authed("/api/v1/vaults", t))).status).toBe(200);
    expect((await call(dashboard, authed("/api/v1/dashboard", t))).status).toBe(200);
    // Everything else, reads included.
    const vaultId = get<{ id: string }>("SELECT id FROM vaults WHERE user_id = ? LIMIT 1", ownerId)?.id ?? "none";
    for (const [h, path, context] of [
      [activity, "/api/v1/activity", undefined],
      [exportData, "/api/v1/me/export", undefined],
      [insight, "/api/v1/insight", undefined],
      [kycStatus, "/api/v1/kyc", undefined],
      [vaultDetail, `/api/v1/vaults/${vaultId}`, ctx(vaultId)],
    ] as const) {
      const r = await call(h, authed(path, t), context);
      expect(r.status, path).toBe(403);
      expect((await r.json()).code).toBe("recovery_restricted");
    }
    const write = await call(createVault, authed("/api/v1/vaults", t, { body: { name: "Mine now", category: "health", target: 100 } }));
    expect(write.status).toBe(403);

    // A person approves.
    const queue = await (await call(adminQueue, authed("/api/v1/admin/recovery", ops))).json();
    expect(queue.queue.map((q: { id: string }) => q.id)).toContain(c.id);
    expect((await call(adminDecide, authed(`/api/v1/admin/recovery/${c.id}`, await token("owner-uid", "shaik@outlook.com"), { body: { decision: "approved", note: "Matches" } }), ctx(c.id))).status).toBe(403);
    const decided = await call(adminDecide, authed(`/api/v1/admin/recovery/${c.id}`, ops, { body: { decision: "approved", note: "ID and face match" } }), ctx(c.id));
    expect((await decided.json()).claim.status).toBe("approved");

    expect((await call(createVault, authed("/api/v1/vaults", t, { body: { name: "Mine now", category: "health", target: 100 } }))).status).toBe(201);
    expect((await call(activity, authed("/api/v1/activity", t))).status).toBe(200);
    expect(identityByUid("new-uid")!.status).toBe("active");
    expect(identityByUid("owner-uid")!.status).toBe("disabled");
    expect((await call(listVaults, authed("/api/v1/vaults", await token("owner-uid", "shaik@outlook.com")))).status).toBe(404);
  });

  it("no match → 404 and nothing bound; a sign-in with a wallet can't claim", async () => {
    const t = await token("stranger-uid");
    const res = await call(claim, await claimReq(t, aadhaar(78), "10.2.0.4"));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("no_match");
    expect(identityByUid("stranger-uid")).toBeUndefined();

    const has = await call(claim, await claimReq(await token("new-uid", "shaik.new@gmail.com"), OWNER, "10.2.0.4"));
    expect(has.status).toBe(409);
    expect((await has.json()).code).toBe("has_wallet");
  });

  it("reject → unbound, photo deleted, and the claimant sees why", async () => {
    const number = aadhaar(2);
    await verifiedWallet("c-owner-uid", "chitra@example.com", "Chitra Nair", number);
    cardReads("Chitra Nair", number);
    const t = await token("d-uid");
    const { claim: c } = await (await call(claim, await claimReq(t, number, "10.2.0.5"))).json();
    expect(c.access).toBe("read_only");
    const photo = claimRow(c.id).file_path!;
    expect(fs.existsSync(photo)).toBe(true);
    await call(adminDecide, authed(`/api/v1/admin/recovery/${c.id}`, ops, { body: { decision: "rejected", note: "The photo doesn't match. Visit a branch with your ID." } }), ctx(c.id));
    const vaults = await call(listVaults, authed("/api/v1/vaults", t));
    expect(vaults.status).toBe(404);
    expect((await vaults.json()).code).toBe("no_wallet");
    const status = await (await call(getClaim, authed("/api/v1/recovery/claim", t))).json();
    expect(status.claim).toMatchObject({ status: "rejected", reasons: ["The photo doesn't match. Visit a branch with your ID."] });
    expect(identityByUid("c-owner-uid")!.status).toBe("active");
    expect(fs.existsSync(photo)).toBe(false);
    expect(claimRow(c.id).file_path).toBeNull();
  });

  it("the claimant can cancel; the photo goes", async () => {
    const number = aadhaar(3);
    await verifiedWallet("e-owner-uid", "esha@example.com", "Esha Patel", number);
    cardReads("Esha Patel", number);
    const t = await token("e-claimant-uid");
    const { claim: c } = await (await call(claim, await claimReq(t, number, "10.2.0.6"))).json();
    const photo = claimRow(c.id).file_path!;
    const r = await call(cancelClaim, authed("/api/v1/recovery/claim", t, { method: "DELETE" }));
    expect((await r.json()).claim.status).toBe("cancelled");
    expect(identityByUid("e-claimant-uid")).toMatchObject({ user_id: null, status: "active" });
    expect(fs.existsSync(photo)).toBe(false);
    expect((await call(cancelClaim, authed("/api/v1/recovery/claim", t, { method: "DELETE" }))).status).toBe(404);
  });

  it("a claim nobody decides lapses after 7 days, leaves no access and no photo", async () => {
    const number = aadhaar(4);
    await verifiedWallet("f-owner-uid", "farah@example.com", "Farah Khan", number);
    cardReads("Farah Khan", number);
    const t = await token("f-claimant-uid");
    const { claim: c } = await (await call(claim, await claimReq(t, number, "10.2.0.7"))).json();
    const photo = claimRow(c.id).file_path!;
    expect((await call(listVaults, authed("/api/v1/vaults", t))).status).toBe(200);
    run("UPDATE recovery_claims SET created_at = ? WHERE id = ?", Date.now() - 8 * 86_400_000, c.id);
    expect((await call(listVaults, authed("/api/v1/vaults", t))).status).toBe(404);
    const status = await (await call(getClaim, authed("/api/v1/recovery/claim", t))).json();
    expect(status.claim.status).toBe("expired");
    expect(get("SELECT 1 FROM audit_log WHERE action = 'recovery.claim_expired' AND entity_id = ?", c.id)).toBeTruthy();
    expect(fs.existsSync(photo)).toBe(false);
  });

  it("two claims at once from one sign-in: only one is created", async () => {
    const number = aadhaar(6);
    await verifiedWallet("i-owner-uid", "isha@example.com", "Isha Roy", number);
    const t = await token("i-claimant-uid");
    const [a, b] = await Promise.all([call(claim, await claimReq(t, number, "10.2.0.8")), call(claim, await claimReq(t, number, "10.2.0.9"))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM recovery_claims WHERE claimant_uid = 'i-claimant-uid' AND status = 'pending'")!.n).toBe(1);
  });
});

describe("dev CORS", () => {
  it("lets the Expo web preview send x-device-id", async () => {
    const rules = await nextConfig.headers!();
    const allow = rules.flatMap((r) => r.headers).find((h) => h.key === "Access-Control-Allow-Headers")?.value ?? "";
    expect(allow.toLowerCase()).toContain("x-device-id");
    expect(allow.toLowerCase()).toContain("authorization");
  });
});
