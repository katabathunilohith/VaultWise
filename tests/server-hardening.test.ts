import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { generateKeyPair, SignJWT } from "jose";
import { productionStartupProblem, productionStartupWarnings } from "@/lib/auth/config";
import { customer, handle, SERVER_ERROR } from "@/lib/api";
import { clientIp, clientKeys } from "@/lib/auth/context";
import { setVerificationKey } from "@/lib/auth/verify";
import { limitUploads, RateLimitError, UPLOADS_PER_HOUR } from "@/lib/rate-limit";
import { createUser, HttpError } from "@/lib/users";
import { POST as onboard } from "@/app/api/v1/onboarding/route";
import { GET as listVaults } from "@/app/api/v1/vaults/route";
import { POST as submitId } from "@/app/api/v1/kyc/route";
import { POST as uploadProof } from "@/app/api/v1/vaults/[id]/proofs/route";
import nextConfig from "../next.config";

/** Calls a route handler the way Next does: (request, context). */
const call = (h: unknown, request?: Request, context?: unknown) => (h as (...a: unknown[]) => Promise<Response>)(request, context);
/** Just after the start of a whole minute, so fixed rate-limit windows can't roll over mid-test. */
const MINUTE_START = Math.floor(Date.now() / 60_000) * 60_000 + 1_000;

describe("production start-up guard", () => {
  it("refuses production without FIREBASE_PROJECT_ID", () => {
    const problem = productionStartupProblem({ NODE_ENV: "production" });
    expect(problem).toMatch(/FIREBASE_PROJECT_ID is not set/);
    expect(problem).toMatch(/ALLOW_PROTOTYPE_IN_PRODUCTION=true/);
    expect(productionStartupProblem({ NODE_ENV: "production", FIREBASE_PROJECT_ID: "   " })).not.toBeNull();
  });

  it("starts in production with sign-in configured", () => {
    expect(productionStartupProblem({ NODE_ENV: "production", FIREBASE_PROJECT_ID: "vaultwise-123" })).toBeNull();
  });

  it("starts the prototype in production only when asked to on purpose", () => {
    expect(productionStartupProblem({ NODE_ENV: "production", ALLOW_PROTOTYPE_IN_PRODUCTION: "true" })).toBeNull();
    expect(productionStartupProblem({ NODE_ENV: "production", ALLOW_PROTOTYPE_IN_PRODUCTION: "TRUE" })).toBeNull();
    expect(productionStartupProblem({ NODE_ENV: "production", ALLOW_PROTOTYPE_IN_PRODUCTION: "1" })).not.toBeNull();
    expect(productionStartupProblem({ NODE_ENV: "production", ALLOW_PROTOTYPE_IN_PRODUCTION: "yes" })).not.toBeNull();
  });

  it("never blocks development or tests", () => {
    expect(productionStartupProblem({ NODE_ENV: "development" })).toBeNull();
    expect(productionStartupProblem({ NODE_ENV: "test" })).toBeNull();
    expect(productionStartupProblem({})).toBeNull();
    expect(productionStartupProblem()).toBeNull();
  });

  it("warns about missing production settings without blocking", () => {
    const base = { NODE_ENV: "production", FIREBASE_PROJECT_ID: "vaultwise-123" };
    const missing = productionStartupWarnings(base).join(" ");
    for (const name of ["IDENTITY_SECRET", "ADMIN_EMAILS", "FIREBASE_WEB_API_KEY", "TRUST_PROXY_HOPS"]) expect(missing).toContain(name);
    const complete = { ...base, IDENTITY_SECRET: "x", ADMIN_EMAILS: "a@b.c", FIREBASE_WEB_API_KEY: "k", TRUST_PROXY_HOPS: "1" };
    expect(productionStartupWarnings(complete)).toEqual([]);
    expect(productionStartupWarnings({ NODE_ENV: "production", ALLOW_PROTOTYPE_IN_PRODUCTION: "true", TRUST_PROXY_HOPS: "1" }).join(" ")).toMatch(
      /no sign-in/,
    );
    expect(productionStartupWarnings({ NODE_ENV: "development" })).toEqual([]);
    // Naming the proxy's address header is as good as counting hops.
    expect(productionStartupWarnings({ ...complete, TRUST_PROXY_HOPS: undefined, TRUST_PROXY_HEADER: "cf-connecting-ip" })).toEqual([]);
  });
});

describe("security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const headersFor = async () => {
    const rules = await nextConfig.headers!();
    return Object.fromEntries(rules.flatMap((r) => r.headers).map((h) => [h.key, h.value]));
  };

  it("sends the hardening headers on every path in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const rules = await nextConfig.headers!();
    expect(rules.map((r) => r.source)).toEqual(["/:path*"]);
    const h = await headersFor();
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toBe("camera=(self), microphone=()");
    const csp = h["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    // The AI provider is only called by the server.
    expect(csp).not.toContain("groq");
    // No CORS in production: the phone app is native and sends no Origin.
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("keeps the development CORS rules for the Expo web preview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const rules = await nextConfig.headers!();
    expect(rules.map((r) => r.source)).toEqual(["/api/:path*"]);
    const h = await headersFor();
    expect(h["Access-Control-Allow-Origin"]).toBe(process.env.MOBILE_DEV_ORIGIN ?? "http://localhost:8081");
    for (const name of ["Authorization", "X-Device-Id", "X-AI-Consent", "X-Device-Platform", "X-App-Version"]) expect(h["Access-Control-Allow-Headers"]).toContain(name);
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it("doesn't advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("generic errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides an unexpected error behind a plain sentence and an id, and logs the details under that id", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = handle<[Request]>(async () => {
      throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: users.secret_column");
    });
    const r = await route(new Request("http://localhost/api/v1/x"));
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body).toEqual({ error: SERVER_ERROR, code: "server_error", errorId: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(JSON.stringify(body)).not.toMatch(/SQLITE|secret_column/);
    const logged = log.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).toContain(body.errorId);
    expect(logged).toContain("UNIQUE constraint failed");
  });

  it("keeps deliberate errors as they were, extra facts included", async () => {
    class Locked extends HttpError {
      extra = { lockedUntil: 123 };
    }
    const r = await handle<[Request]>(async () => {
      throw new Locked(423, "Too many wrong tries.", "mpin_locked");
    })(new Request("http://localhost/api/v1/x"));
    expect(r.status).toBe(423);
    expect(await r.json()).toEqual({ lockedUntil: 123, error: "Too many wrong tries.", code: "mpin_locked" });
    expect(r.headers.get("Retry-After")).toBeNull();
  });

  it("says when to come back on a 429 that knows its window", async () => {
    const r = await handle<[Request]>(async () => {
      throw new RateLimitError("Too many requests. Wait a minute and try again.", 42);
    })(new Request("http://localhost/api/v1/x"));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("42");
    expect(await r.json()).toEqual({ error: "Too many requests. Wait a minute and try again.", code: "rate_limited" });
  });
});

describe("the client IP for rate limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const h = (headers: Record<string, string>) => new Headers(headers);
  const all = { "cf-connecting-ip": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6, 198.51.100.3" };

  it("believes no address header without a proxy in front (a client could pick its own key)", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    vi.stubEnv("TRUST_PROXY_HEADER", "");
    expect(clientIp(h(all))).toBeNull();
    expect(clientIp(h({ "x-real-ip": "198.51.100.2" }))).toBeNull();
    // The device id still works as an extra key for the recovery limits.
    expect(clientKeys(h({ ...all, "x-device-id": "dev-1" }))).toEqual(["device:dev-1"]);
  });

  it("behind TRUST_PROXY_HOPS proxies: cf-connecting-ip, then x-real-ip, then the trusted x-forwarded-for hop", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    vi.stubEnv("TRUST_PROXY_HEADER", "");
    expect(clientIp(h(all))).toBe("198.51.100.1");
    expect(clientIp(h({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6, 198.51.100.3" }))).toBe("198.51.100.2");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.3" }))).toBe("198.51.100.3");
    expect(clientKeys(h({ "x-real-ip": "198.51.100.2", "x-device-id": "dev-1" }))).toEqual(["ip:198.51.100.2", "device:dev-1"]);
  });

  it("with TRUST_PROXY_HEADER, believes only that header", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    vi.stubEnv("TRUST_PROXY_HEADER", "x-real-ip");
    expect(clientIp(h(all))).toBe("198.51.100.2");
    expect(clientIp(h({ "cf-connecting-ip": "198.51.100.1" }))).toBeNull();
    vi.stubEnv("TRUST_PROXY_HEADER", "CF-Connecting-IP");
    expect(clientIp(h(all))).toBe("198.51.100.1");
    // An unknown name trusts no header; x-forwarded-for still follows TRUST_PROXY_HOPS.
    vi.stubEnv("TRUST_PROXY_HEADER", "x-client-ip");
    expect(clientIp(h({ ...all, "x-client-ip": "1.2.3.4" }))).toBeNull();
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    expect(clientIp(h(all))).toBe("198.51.100.3");
  });
});

describe("the general rate limit per client IP", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MINUTE_START);
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "3");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  const ok = handle<[Request]>(async () => Response.json({ ok: true }));
  const from = (ip: string) => new Request("http://localhost/api/v1/region", { headers: { "x-real-ip": ip } });

  it("limits each client IP on every route, with a Retry-After", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    for (let i = 0; i < 3; i++) expect((await ok(from("203.0.113.10"))).status).toBe(200);
    const refused = await ok(from("203.0.113.10"));
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "rate_limited" });
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await ok(from("203.0.113.11"))).status).toBe(200);
    // The next minute starts afresh.
    vi.setSystemTime(MINUTE_START + 60_000);
    expect((await ok(from("203.0.113.10"))).status).toBe(200);
  });

  it("skips the IP limit when the IP can't be trusted, and is off at 0", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");
    for (let i = 0; i < 5; i++) expect((await ok(from("203.0.113.20"))).status).toBe(200);
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "0");
    for (let i = 0; i < 5; i++) expect((await ok(from("203.0.113.21"))).status).toBe(200);
  });
});

describe("the general rate limit per signed-in person", () => {
  const PROJECT = "vaultwise-hardening-test";
  let privateKey: CryptoKey;
  const token = (uid: string) =>
    new SignJWT({ email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "password" } })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  const authed = (t: string, body?: unknown) =>
    new Request(`http://localhost/api/v1/${body ? "onboarding" : "vaults"}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

  beforeAll(async () => {
    const kp = await generateKeyPair("RS256");
    privateKey = kp.privateKey;
    setVerificationKey(kp.publicKey);
    process.env.FIREBASE_PROJECT_ID = PROJECT;
  });
  afterAll(() => {
    setVerificationKey(null);
    delete process.env.FIREBASE_PROJECT_ID;
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("counts each person's requests, whatever address they come from", async () => {
    const [anna, ben] = [await token("anna-uid"), await token("ben-uid")];
    for (const t of [anna, ben]) expect((await call(onboard, authed(t, { name: "Tester", country: "IN", pin: "482915", demo: false }))).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MINUTE_START);
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "3");
    for (let i = 0; i < 3; i++) expect((await call(listVaults, authed(anna))).status).toBe(200);
    const refused = await call(listVaults, authed(anna));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).not.toBeNull();
    expect((await call(listVaults, authed(ben))).status).toBe(200);
  });
});

describe("uploads", () => {
  const photo = async () =>
    new File([new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#cccccc" } }).jpeg().toBuffer())], "x.jpg", {
      type: "image/jpeg",
    });

  it(`allows ${UPLOADS_PER_HOUR} photos per person per hour`, () => {
    const t0 = Date.UTC(2026, 10, 22, 9, 0, 0);
    for (let i = 0; i < UPLOADS_PER_HOUR; i++) limitUploads("usr_upload_unit", t0 + i);
    expect(() => limitUploads("usr_upload_unit", t0 + 30 * 60_000)).toThrow(RateLimitError);
    expect(limitUploads("usr_upload_unit", t0 + 60 * 60_000).remaining).toBe(UPLOADS_PER_HOUR - 1);
  });

  it("refuses the ID photo and bill routes once the hour's uploads are used, before reading the file", async () => {
    // Prototype mode: the first wallet on the server is the customer.
    createUser({ name: "Upload Tester", country: "IN", pin: "2468" });
    const owner = await customer({ tick: false });
    for (let i = 0; i < UPLOADS_PER_HOUR; i++) limitUploads(owner.id);
    const form = new FormData();
    form.set("docType", "pan");
    form.set("file", await photo());
    const id = await call(submitId, new Request("http://localhost/api/v1/kyc", { method: "POST", body: form }));
    expect(id.status).toBe(429);
    expect(id.headers.get("Retry-After")).not.toBeNull();
    // (The wallets above started in firebase mode, waiting for an ID check; the bill route checks that first.)
    vi.stubEnv("KYC_ENFORCED", "false");
    const bill = new FormData();
    bill.set("file", await photo());
    bill.set("withdrawalId", "wd_none");
    const r = await call(uploadProof, new Request("http://localhost/api/v1/vaults/vlt_none/proofs", { method: "POST", body: bill }), {
      params: Promise.resolve({ id: "vlt_none" }),
    });
    expect(r.status).toBe(429);
    vi.unstubAllEnvs();
  });
});
