import { afterEach, describe, expect, it, vi } from "vitest";
import { all, get, run } from "@/lib/db";
import { checkPin, createUser, type User } from "@/lib/users";
import { attemptState, requireMpin } from "@/lib/mpin";
import { listAlerts } from "@/lib/alerts";
import {
  consumeVerification,
  maskPhone,
  newCode,
  normalisePhone,
  OTP_NEW_NUMBER_SENDS_PER_HOUR,
  OTP_SENDS_PER_HOUR,
  OTP_TTL_MS,
  PHONE_RESET_HOLD_MS,
  OtpError,
  otpSender,
  sendOtp,
  setVerifiedPhone,
  smsText,
  TWILIO_API,
  twilioConfig,
  twilioSender,
  VERIFICATION_TTL_MS,
  verifiedPhone,
  verifyOtp,
} from "@/lib/otp";
import { COOL_DOWN_MS } from "@/lib/devices";
import { GET as getMe } from "@/app/api/v1/me/route";
import { POST as sendRoute } from "@/app/api/v1/otp/send/route";
import { POST as verifyRoute } from "@/app/api/v1/otp/verify/route";
import { POST as phoneRoute } from "@/app/api/v1/me/phone/route";
import { POST as mpinResetRoute } from "@/app/api/v1/mpin/reset/route";


/* ---------- Helpers ---------- */

const HOUR = 3_600_000;
const PIN = "482915";
const NEW_PIN = "739204";

function req(path: string, opts: { body?: unknown; device?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.device) headers["x-device-id"] = opts.device;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: opts.body !== undefined ? "POST" : "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const call = (h: unknown, request?: Request) => (h as (...a: unknown[]) => Promise<Response>)(request);
const send = (body: unknown, device?: string) => call(sendRoute, req("/api/v1/otp/send", { body, device }));
const verify = (body: unknown, device?: string) => call(verifyRoute, req("/api/v1/otp/verify", { body, device }));

/** Runs `fn` and returns the OtpError it throws (sync or async). */
async function otpErrorOf(fn: () => unknown): Promise<OtpError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof OtpError) return e;
    throw e;
  }
  throw new Error("expected an OtpError");
}

const newUser = (name: string) => createUser({ name, jurisdiction: "IN", pin: PIN });

// Prototype mode: the first user is the customer every route acts for.
const main = createUser({ name: "Otto Pee", jurisdiction: "IN", pin: PIN, createdAt: Date.now() - HOUR });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", main.id)!;
const clearAttempts = () => {
  attemptState(main.id); // creates the table on first use
  run("DELETE FROM mpin_attempts WHERE user_id = ?", main.id);
};

afterEach(() => {
  delete process.env.OTP_MODE;
  delete process.env.OTP_TEST_ALLOWED;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ---------- Pure parts ---------- */

describe("codes and numbers", () => {
  it("makes 6-digit codes, keeping leading zeros", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it("accepts full international numbers only, and masks them", () => {
    expect(normalisePhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalisePhone("(+1) 555 123 4567")).toBe("+15551234567");
    expect(normalisePhone("9876543210")).toBeNull();
    expect(normalisePhone("+0123456789")).toBeNull();
    expect(normalisePhone("+12")).toBeNull();
    expect(maskPhone("+919876543210")).toBe("+91••••••3210");
  });

  it("says in the SMS what the code is for", () => {
    expect(smsText("mpin_reset", "123456")).toBe(
      "Your Vaultwise code to reset your MPIN is 123456. It expires in 5 minutes. Never share it with anyone, not even Vaultwise staff.",
    );
    expect(smsText("device_trust", "000001")).toContain("to trust a new device");
  });
});

/* ---------- Which sender ---------- */

describe("choosing a sender", () => {
  it("is off unless OTP_MODE is set: 503 otp_unavailable", async () => {
    const r = await send({ purpose: "phone_verify", phone: "+919800000001" });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("otp_unavailable");
  });

  it("refuses the test sender on a production build unless OTP_TEST_ALLOWED=true", () => {
    process.env.OTP_MODE = "test";
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => otpSender()).toThrow(OtpError);
    process.env.OTP_TEST_ALLOWED = "true";
    expect(otpSender().name).toBe("test");
  });

  it("needs all three Twilio settings for OTP_MODE=twilio", () => {
    process.env.OTP_MODE = "twilio";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => otpSender()).toThrow(OtpError);
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBeNull();
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM = "+15005550006";
    expect(otpSender().name).toBe("twilio");
  });
});

/* ---------- Twilio (written from the docs; fetch mocked) ---------- */

describe("the Twilio sender", () => {

    const cfg = {accountSid: "TEST_ACCOUNT_SID", authToken: "test_auth_token", from: "+15005550006"};

  it("posts the message to Twilio's Messages API with Basic auth", async () => {
    const fetchMock = vi.fn(async () => Response.json({ sid: "SM1", status: "queued" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await twilioSender(cfg).send({ phone: "+919876543210", code: "123456", purpose: "phone_verify", text: "Your code is 123456" });
    expect(out).toEqual({});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${TWILIO_API}/Accounts/${cfg.accountSid}/Messages.json`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    // expect(headers.authorization).toBe(`Basic ${Buffer.from(`${cfg.accountSid}:tok`).toString("base64")}`);

    expect(headers.authorization).toBe( `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`);

    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(form)).toEqual({ To: "+919876543210", Body: "Your code is 123456", From: "+15005550006" });
  });

  it("uses a Messaging Service SID when TWILIO_FROM is one", async () => {
    const fetchMock = vi.fn(async () => Response.json({ sid: "SM1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    
    const mg = "MG00000000000000000000000000000000";
    await twilioSender({ ...cfg, from: mg }).send({ phone: "+15551234567", code: "1", purpose: "mpin_reset", text: "x" });
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(form.get("MessagingServiceSid")).toBe(mg);
    expect(form.get("From")).toBeNull();
  });

  it("turns a refusal or a network failure into 502 otp_send_failed, and logs why", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 21211, message: "Invalid 'To' Phone Number" }, { status: 400 })));
    const refused = await otpErrorOf(() => twilioSender(cfg).send({ phone: "+15551234567", code: "1", purpose: "phone_verify", text: "x" }));
    expect(refused).toMatchObject({ status: 502, code: "otp_send_failed" });
    expect(String(err.mock.calls[0][0])).toContain("21211");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ETIMEDOUT"))));
    expect(await otpErrorOf(() => twilioSender(cfg).send({ phone: "+15551234567", code: "1", purpose: "phone_verify", text: "x" }))).toMatchObject({
      code: "otp_send_failed",
    });
  });

  it("through the route: no testCode, and a failed send still counts toward the hourly limit", async () => {
    process.env.OTP_MODE = "twilio";
    process.env.TWILIO_ACCOUNT_SID = cfg.accountSid;
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM = cfg.from;
    const u = newUser("Twilio Tara");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sid: "SM1" }, { status: 201 })));
    const ok = await sendOtp(u, { purpose: "phone_verify", phone: "+919811111111" });
    expect(ok.testCode).toBeUndefined();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 1 }, { status: 500 })));
    await otpErrorOf(() => sendOtp(u, { purpose: "phone_verify", phone: "+919811111111" }));
    const rows = all<{ used_at: number | null }>("SELECT used_at FROM otp_codes WHERE user_id = ? ORDER BY created_at", u.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.used_at !== null)).toBe(true); // the first was replaced, the failed one can't be typed
  });
});

/* ---------- Codes ---------- */

describe("sending and checking codes", () => {
  it("stores only a hash of the code, and answers testCode in test mode", async () => {
    process.env.OTP_MODE = "test";
    const r = await send({ purpose: "phone_verify", phone: "+91 98000 00001" });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ sentTo: "+91••••••0001" });
    expect(j.testCode).toMatch(/^\d{6}$/);
    expect(j.expiresAt - Date.now()).toBeGreaterThan(OTP_TTL_MS - 5_000);
    const row = get<Record<string, unknown>>("SELECT * FROM otp_codes WHERE id = ?", j.otpId)!;
    expect(Object.values(row).some((v) => String(v) === j.testCode)).toBe(false);
    expect(String(row.code_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect((await send({ purpose: "phone_verify", phone: "98000 00001" })).status).toBe(400);
  });

  it("allows 3 tries: wrong answers say how many are left, the third uses the code up", async () => {
    process.env.OTP_MODE = "test";
    const { otpId, testCode } = await (await send({ purpose: "phone_verify", phone: "+919800000002" })).json();
    const wrong = testCode === "111111" ? "222222" : "111111";
    const w1 = await verify({ otpId, code: wrong });
    expect(w1.status).toBe(400);
    expect(await w1.json()).toMatchObject({ code: "otp_wrong", triesLeft: 2 });
    // Not 6 digits: refused, but not counted.
    expect(await (await verify({ otpId, code: "12" })).json()).toMatchObject({ code: "otp_wrong", triesLeft: 2 });
    expect(await (await verify({ otpId, code: wrong })).json()).toMatchObject({ code: "otp_wrong", triesLeft: 1 });
    const w3 = await verify({ otpId, code: wrong });
    expect(w3.status).toBe(410);
    expect((await w3.json()).code).toBe("otp_exhausted");
    expect((await (await verify({ otpId, code: testCode })).json()).code).toBe("otp_exhausted");
  });

  it("expires after 5 minutes, and a newer code replaces the older one", async () => {
    process.env.OTP_MODE = "test";
    const u = newUser("Expiry Eli");
    const t0 = Date.now();
    const a = await sendOtp(u, { purpose: "phone_verify", phone: "+919800000003" }, t0);
    expect((await otpErrorOf(() => verifyOtp(u, { otpId: a.otpId, code: a.testCode! }, t0 + OTP_TTL_MS + 1))).code).toBe("otp_expired");
    const b = await sendOtp(u, { purpose: "phone_verify", phone: "+919800000003" }, t0 + 1000);
    const c = await sendOtp(u, { purpose: "phone_verify", phone: "+919800000003" }, t0 + 2000);
    expect((await otpErrorOf(() => verifyOtp(u, { otpId: b.otpId, code: b.testCode! }, t0 + 3000))).code).toBe("otp_used");
    expect(verifyOtp(u, { otpId: c.otpId, code: c.testCode! }, t0 + 3000).purpose).toBe("phone_verify");
    // Someone else's code isn't found.
    expect((await otpErrorOf(() => verifyOtp(main, { otpId: c.otpId, code: c.testCode! }))).code).toBe("otp_not_found");
  });

  it("sends at most 5 codes an hour per person (and so per person to one number)", async () => {
    process.env.OTP_MODE = "test";
    const u = newUser("Limit Lena");
    const t0 = Date.now();
    for (let i = 0; i < OTP_SENDS_PER_HOUR; i++) await sendOtp(u, { purpose: "phone_verify", phone: `+91980000010${i}` }, t0 + i);
    const limited = await otpErrorOf(() => sendOtp(u, { purpose: "phone_verify", phone: "+919800000199" }, t0 + 10));
    expect(limited).toMatchObject({ status: 429, code: "otp_rate_limited", extra: { retryAt: t0 + HOUR } });
    expect((await sendOtp(u, { purpose: "phone_verify", phone: "+919800000199" }, t0 + HOUR + 1)).otpId).toBeTruthy();
  });

  it("caps phone_verify codes to one number from all accounts at 15 an hour, without blocking the owner's own codes", async () => {
    process.env.OTP_MODE = "test";
    const t0 = Date.now();
    const target = "+919800000200";
    const owner = newUser("Owner Oona");
    setVerifiedPhone(owner, target, t0 - 100 * HOUR);
    // Other accounts send codes to the owner's number: each up to 5, and all of them together up to 15.
    const bombers = [newUser("Bomb A"), newUser("Bomb B"), newUser("Bomb C"), newUser("Bomb D")];
    let sent = 0;
    for (const b of bombers)
      for (let i = 0; i < OTP_SENDS_PER_HOUR && sent < OTP_NEW_NUMBER_SENDS_PER_HOUR; i++, sent++)
        await sendOtp(b, { purpose: "phone_verify", phone: target }, t0 + sent);
    expect(sent).toBe(OTP_NEW_NUMBER_SENDS_PER_HOUR);
    const refused = await otpErrorOf(() => sendOtp(newUser("Bomb E"), { purpose: "phone_verify", phone: target }, t0 + 20));
    expect(refused).toMatchObject({ status: 429, code: "otp_rate_limited", extra: { retryAt: t0 + HOUR } });
    // The owner's codes to their verified number still go: trusting a device, resetting the MPIN, re-verifying it.
    expect((await sendOtp(owner, { purpose: "device_trust" }, t0 + 21)).sentTo).toBe("+91••••••0200");
    expect((await sendOtp(owner, { purpose: "mpin_reset" }, t0 + 22)).sentTo).toBe("+91••••••0200");
    expect((await sendOtp(owner, { purpose: "phone_verify", phone: target }, t0 + 23)).sentTo).toBe("+91••••••0200");
    // ...and they don't count toward the cap: only sends to a number the sender hasn't verified do.
    const counted = get<{ n: number }>("SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND new_number = 1", target)!.n;
    expect(counted).toBe(OTP_NEW_NUMBER_SENDS_PER_HOUR);
  });

  it("sends device_trust and mpin_reset codes only to a verified number", async () => {
    process.env.OTP_MODE = "test";
    const u = newUser("No Phone Nora");
    expect((await otpErrorOf(() => sendOtp(u, { purpose: "mpin_reset" }))).code).toBe("phone_required");
    setVerifiedPhone(u, "+919800000300");
    const sent = await sendOtp(u, { purpose: "device_trust", phone: "+919899999999" });
    expect(sent.sentTo).toBe("+91••••••0300");
  });
});

/* ---------- Verification tokens ---------- */

describe("verification tokens", () => {
  it("are single use, last 10 minutes, and are bound to the person and the purpose", async () => {
    process.env.OTP_MODE = "test";
    const u = newUser("Token Theo");
    const other = newUser("Other Olive");
    const t0 = Date.now();
    const tokenFor = async (now: number) => {
      const s = await sendOtp(u, { purpose: "phone_verify", phone: "+919800000400" }, now);
      return verifyOtp(u, { otpId: s.otpId, code: s.testCode! }, now);
    };
    const v = await tokenFor(t0);
    expect(v.expiresAt).toBe(t0 + VERIFICATION_TTL_MS);
    expect((await otpErrorOf(() => consumeVerification(other, v.verificationToken, "phone_verify", t0))).code).toBe("verification_invalid");
    expect((await otpErrorOf(() => consumeVerification(u, v.verificationToken, "mpin_reset", t0))).code).toBe("verification_invalid");
    expect((await otpErrorOf(() => consumeVerification(u, v.verificationToken, "phone_verify", t0 + VERIFICATION_TTL_MS + 1))).code).toBe("verification_invalid");
    expect(consumeVerification(u, v.verificationToken, "phone_verify", t0 + 1000)).toEqual({ phone: "+919800000400" });
    expect((await otpErrorOf(() => consumeVerification(u, v.verificationToken, "phone_verify", t0 + 2000))).code).toBe("verification_invalid");
    // Only a hash of the token is stored.
    expect(get("SELECT * FROM otp_verifications WHERE token_hash = ?", v.verificationToken)).toBeUndefined();
  });
});

/* ---------- Phone number on the account ---------- */

describe("verifying the phone number", () => {
  const setPhone = (body: unknown, device?: string) => call(phoneRoute, req("/api/v1/me/phone", { body, device }));

  it("needs the MPIN to add a first number, and wrong tries count toward the lock", async () => {
    process.env.OTP_MODE = "test";
    clearAttempts();
    const { otpId, testCode } = await (await send({ purpose: "phone_verify", phone: "+919812340000" })).json();
    const { verificationToken } = await (await verify({ otpId, code: testCode })).json();
    const none = await setPhone({ verificationToken });
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: "Enter your MPIN to continue.", code: "mpin_required" });
    const wrong = await setPhone({ verificationToken, pin: "000000" });
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toMatchObject({ code: "mpin_wrong", triesLeft: 4 });
    expect(attemptState(main.id).failures).toBe(1);
    expect(verifiedPhone(main.id)).toBeNull();
    // Rollback mode still checks it (an "always" check).
    process.env.MPIN_ENFORCED = "false";
    try {
      expect((await (await setPhone({ verificationToken, pin: "000000" })).json()).code).toBe("mpin_wrong");
      expect(attemptState(main.id).failures).toBe(2);
    } finally {
      delete process.env.MPIN_ENFORCED;
    }
    clearAttempts();
  });

  it("sets the number the code went to, shows it masked on /me, audits and alerts", async () => {
    process.env.OTP_MODE = "test";
    expect((await (await call(getMe)).json()).phone).toEqual({ number: null, verified: false });
    const { otpId, testCode } = await (await send({ purpose: "phone_verify", phone: "+919812345678" })).json();
    const { verificationToken, purpose } = await (await verify({ otpId, code: testCode })).json();
    expect(purpose).toBe("phone_verify");
    expect(await (await setPhone({ verificationToken, pin: PIN })).json()).toEqual({ ok: true });
    expect((await (await call(getMe)).json()).phone).toEqual({ number: "+91••••••5678", verified: true });
    expect(verifiedPhone(main.id)).toBe("+919812345678");
    const alert = listAlerts(main.id).find((a) => a.kind === "phone_verified")!;
    expect(alert.body).toMatch(/can't be used to reset your MPIN for the next 72 hours/);
    const audit = get<{ details: string }>("SELECT details FROM audit_log WHERE action = 'phone.verified' AND user_id = ?", main.id)!;
    expect(JSON.parse(audit.details)).toEqual({ phone: "+91••••••5678", replaced: null });
    const again = await setPhone({ verificationToken, pin: PIN });
    expect((await again.json()).code).toBe("verification_invalid");
  });

  it("changes nothing when the same number is proved again", () => {
    const u = newUser("Same Sam");
    setVerifiedPhone(u, "+919800000777", Date.now() - 100 * HOUR);
    const before = get<{ t: number }>("SELECT phone_verified_at AS t FROM users WHERE id = ?", u.id)!.t;
    const alerts = listAlerts(u.id).length;
    setVerifiedPhone(u, "+919800000777");
    expect(get<{ t: number }>("SELECT phone_verified_at AS t FROM users WHERE id = ?", u.id)!.t).toBe(before);
    expect(listAlerts(u.id)).toHaveLength(alerts);
  });

  it("won't let a new device replace a verified number", async () => {
    process.env.OTP_MODE = "test";
    await call(getMe, req("/api/v1/me", { device: "otp-phone-0000-0001" })); // the first device: trusted
    await call(getMe, req("/api/v1/me", { device: "otp-phone-0000-0002" })); // a later one: untrusted
    const refused = await send({ purpose: "phone_verify", phone: "+919800000500" }, "otp-phone-0000-0002");
    expect(refused.status).toBe(403);
    const j = await refused.json();
    expect(j.code).toBe("device_untrusted");
    expect(j.trustableAt).toBeGreaterThan(Date.now() + COOL_DOWN_MS - 60_000);
    // From the trusted phone it works, and the new number replaces the old.
    const { otpId, testCode } = await (await send({ purpose: "phone_verify", phone: "+919800000500" }, "otp-phone-0000-0001")).json();
    const { verificationToken } = await (await verify({ otpId, code: testCode }, "otp-phone-0000-0001")).json();
    // The device is checked before the MPIN, so the refusal costs no MPIN try.
    expect((await (await setPhone({ verificationToken, pin: PIN }, "otp-phone-0000-0002")).json()).code).toBe("device_untrusted");
    // From the trusted phone it still needs the MPIN.
    expect((await (await setPhone({ verificationToken }, "otp-phone-0000-0001")).json()).code).toBe("mpin_required");
    expect(attemptState(main.id).failures).toBe(0);
    expect(await (await setPhone({ verificationToken, pin: PIN }, "otp-phone-0000-0001")).json()).toEqual({ ok: true });
    expect(verifiedPhone(main.id)).toBe("+919800000500");
  });
});

/* ---------- Resetting a forgotten MPIN ---------- */

describe("resetting the MPIN with a texted code", () => {
  const TRUSTED = "otp-phone-0000-0001";
  const reset = (body: unknown, device = TRUSTED) => call(mpinResetRoute, req("/api/v1/mpin/reset", { body, device }));

  async function resetToken(device = TRUSTED) {
    const { otpId, testCode } = await (await send({ purpose: "mpin_reset" }, device)).json();
    return (await (await verify({ otpId, code: testCode }, device)).json()).verificationToken as string;
  }

  it("is refused for 72 hours after the number was added or changed, before any code is sent", async () => {
    process.env.OTP_MODE = "test";
    run("DELETE FROM otp_codes WHERE user_id = ?", main.id); // a fresh hour for this person
    const changed = get<{ t: number }>("SELECT phone_verified_at AS t FROM users WHERE id = ?", main.id)!.t;
    const r = await send({ purpose: "mpin_reset" }, TRUSTED);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "phone_recently_changed", allowedAt: changed + PHONE_RESET_HOLD_MS });
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM otp_codes WHERE user_id = ?", main.id)!.n).toBe(0);
    const refused = await reset({ verificationToken: "anything", newPin: NEW_PIN });
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("phone_recently_changed");
    // 72 hours later it is allowed (the next test resets the MPIN).
    run("UPDATE users SET phone_verified_at = ? WHERE id = ?", Date.now() - PHONE_RESET_HOLD_MS - 60_000, main.id);
  });

  it("checks the new MPIN first, then uses the token, clears the lock, audits and alerts", async () => {
    process.env.OTP_MODE = "test";
    run("DELETE FROM otp_codes WHERE user_id = ?", main.id); // a fresh hour for this person
    for (let i = 0; i < 5; i++) {
      try {
        requireMpin(fresh(), "000000", "wallet_spend");
      } catch {
        // wrong MPIN
      }
    }
    expect(attemptState(main.id).lockedUntil).not.toBeNull();

    const token = await resetToken();
    const weak = await reset({ verificationToken: token, newPin: "123456" });
    expect(weak.status).toBe(400);
    expect(await weak.json()).toMatchObject({ code: "mpin_weak", reason: "sequence" });

    expect(await (await reset({ verificationToken: token, newPin: NEW_PIN })).json()).toEqual({ ok: true });
    expect(checkPin(fresh(), NEW_PIN)).toBe(true);
    expect(attemptState(main.id)).toEqual({ failures: 0, lockedUntil: null });
    const audit = all<{ details: string }>("SELECT details FROM audit_log WHERE action = 'mpin.changed' AND user_id = ?", main.id).at(-1)!;
    expect(JSON.parse(audit.details)).toEqual({ by: "reset", digits: 6 });
    expect(listAlerts(main.id).find((a) => a.kind === "mpin_changed")!.title).toBe("MPIN reset");
    expect((await (await reset({ verificationToken: token, newPin: "582916" })).json()).code).toBe("verification_invalid");
  });

  it("is refused from a new device, before any code is sent", async () => {
    process.env.OTP_MODE = "test";
    const untrusted = "otp-phone-0000-0002";
    const before = get<{ n: number }>("SELECT COUNT(*) AS n FROM otp_codes WHERE user_id = ?", main.id)!.n;
    const r = await send({ purpose: "mpin_reset" }, untrusted);
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("device_untrusted");
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM otp_codes WHERE user_id = ?", main.id)!.n).toBe(before);
    const token = await resetToken();
    expect((await (await reset({ verificationToken: token, newPin: "582916" }, untrusted)).json()).code).toBe("device_untrusted");
    expect(checkPin(fresh(), NEW_PIN)).toBe(true);
  });
});
