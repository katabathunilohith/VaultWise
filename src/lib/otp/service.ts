import crypto from "node:crypto";
import { newId } from "../db";
import { audit } from "../audit";
import type { User } from "../users";
import { HOUR_MS, OTP_DIGITS, OTP_MAX_TRIES, OTP_NEW_NUMBER_SENDS_PER_HOUR, OTP_SENDS_PER_HOUR, OTP_TTL_MS, VERIFICATION_TTL_MS, type OtpPurpose } from "./config";
import { OtpError } from "./errors";
import { maskPhone, normalisePhone, verifiedPhone } from "./phone";
import { otpSender } from "./senders";
import {
  codeFor,
  insertCode,
  insertVerification,
  markCodeUsed,
  newNumberSendsTo,
  recordWrongTry,
  sendsByUser,
  sendsByUserTo,
  supersedeCodes,
  spendVerification,
  verificationByHash,
} from "./store";

/* ---------- Hashing ---------- */

/**
 * The stored form of a code: HMAC-SHA256 keyed with IDENTITY_SECRET (a fixed key when it isn't set),
 * over the code's id, a random salt and the code. A database copy alone doesn't give the code away
 * when the secret is set; without it the salt still stops precomputed tables, and codes last 5 minutes.
 */
function codeHash(otpId: string, salt: string, code: string): string {
  const key = process.env.IDENTITY_SECRET?.trim() || "vaultwise-otp-dev-key";
  return crypto.createHmac("sha256", key).update(`otp:${otpId}:${salt}:${code}`).digest("hex");
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** A uniformly random 6-digit code ("000000" to "999999"). */
export function newCode(): string {
  return String(crypto.randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");
}

const WHAT: Record<OtpPurpose, string> = {
  phone_verify: "to verify this phone number",
  device_trust: "to trust a new device on your account",
  mpin_reset: "to reset your MPIN",
};

/** The SMS text. It says what the code is for, so someone tricked into reading it out might notice. */
export function smsText(purpose: OtpPurpose, code: string): string {
  return `Your Vaultwise code ${WHAT[purpose]} is ${code}. It expires in ${OTP_TTL_MS / 60_000} minutes. Never share it with anyone, not even Vaultwise staff.`;
}

/* ---------- Sending ---------- */

export interface SentOtp {
  otpId: string;
  expiresAt: number;
  /** The masked number the code went to. */
  sentTo: string;
  /** Only from the test sender (OTP_MODE=test). */
  testCode?: string;
}

function rateLimited(oldest: number | null, now: number) {
  const retryAt = (oldest ?? now) + HOUR_MS;
  const mins = Math.max(1, Math.ceil((retryAt - now) / 60_000));
  return new OtpError(429, `Too many codes asked for. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, "otp_rate_limited", { retryAt });
}

/**
 * Sends a code. `phone_verify` sends to the number given; `device_trust` and `mpin_reset` to the
 * account's verified number (409 `phone_required` when there is none). Limits, each a 429
 * `otp_rate_limited` with `retryAt`:
 * - 5 codes per person in any hour, and 5 per person to one number;
 * - 15 `phone_verify` codes to one number in any hour from all accounts together, counting only sends to
 *   a number the sending account hasn't verified, and refusing only such sends. Another account can
 *   then slow down new sign-ups to a number, but never block the owner's own codes to their verified
 *   number (device trust, MPIN reset, re-verifying it).
 * A new code replaces earlier unused ones for the same purpose. A send that the provider refuses still counts.
 */
export async function sendOtp(user: Pick<User, "id">, input: { purpose: OtpPurpose; phone?: string | null }, now = Date.now()): Promise<SentOtp> {
  const sender = otpSender();
  const verified = verifiedPhone(user.id);
  let phone: string | null;
  if (input.purpose === "phone_verify") {
    phone = normalisePhone(input.phone);
    if (!phone) throw new OtpError(400, "Enter your mobile number with the country code, like +91 98765 43210.", "phone_invalid");
  } else {
    phone = verified;
    if (!phone) throw new OtpError(409, "Add and verify a phone number first, in Settings.", "phone_required");
  }
  const newNumber = input.purpose === "phone_verify" && phone !== verified;

  const since = now - HOUR_MS;
  const byUser = sendsByUser(user.id, since);
  if (byUser.n >= OTP_SENDS_PER_HOUR) throw rateLimited(byUser.oldest, now);
  const byUserTo = sendsByUserTo(user.id, phone, since);
  if (byUserTo.n >= OTP_SENDS_PER_HOUR) throw rateLimited(byUserTo.oldest, now);
  if (newNumber) {
    const toNumber = newNumberSendsTo(phone, since);
    if (toNumber.n >= OTP_NEW_NUMBER_SENDS_PER_HOUR) throw rateLimited(toNumber.oldest, now);
  }

  const otpId = newId("otp");
  const code = newCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const expiresAt = now + OTP_TTL_MS;
  insertCode({
    id: otpId,
    user_id: user.id,
    purpose: input.purpose,
    phone,
    salt,
    code_hash: codeHash(otpId, salt, code),
    created_at: now,
    expires_at: expiresAt,
    new_number: newNumber ? 1 : 0,
  });
  supersedeCodes(user.id, input.purpose, otpId, now);

  let sent: { testCode?: string };
  try {
    sent = await sender.send({ phone, code, purpose: input.purpose, text: smsText(input.purpose, code) });
  } catch (e) {
    markCodeUsed(otpId, now); // never delivered, so it can't be typed; it still counts toward the limit
    throw e;
  }
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "otp.sent",
    entityType: "otp",
    entityId: otpId,
    details: { purpose: input.purpose, to: maskPhone(phone), via: sender.name },
    ts: now,
  });
  return { otpId, expiresAt, sentTo: maskPhone(phone), ...(sent.testCode ? { testCode: sent.testCode } : {}) };
}

/* ---------- Verifying ---------- */

export interface Verification {
  verificationToken: string;
  purpose: OtpPurpose;
  expiresAt: number;
}

/**
 * Checks a code. Right → a verification token (valid 10 minutes, once, for this person and purpose).
 * Wrong → 400 `otp_wrong` with `triesLeft`; the third wrong try uses the code up (410 `otp_exhausted`).
 * Expired → 410 `otp_expired`; used or replaced → 410 `otp_used`; not this person's → 404 `otp_not_found`.
 * Something that isn't 6 digits is refused without counting as a try.
 */
export function verifyOtp(user: Pick<User, "id">, input: { otpId: string; code: string }, now = Date.now()): Verification {
  const row = codeFor(user.id, input.otpId);
  if (!row) throw new OtpError(404, "We couldn't find that code. Ask for a new one.", "otp_not_found");
  if (row.used_at !== null) {
    if (row.tries >= OTP_MAX_TRIES) throw new OtpError(410, "Too many wrong tries for that code. Ask for a new one.", "otp_exhausted");
    throw new OtpError(410, "That code was already used or replaced by a newer one. Ask for a new one.", "otp_used");
  }
  if (now > row.expires_at) throw new OtpError(410, "That code has expired. Ask for a new one.", "otp_expired");
  const code = input.code.trim();
  if (!new RegExp(`^\\d{${OTP_DIGITS}}$`).test(code))
    throw new OtpError(400, `Enter the ${OTP_DIGITS}-digit code we texted you.`, "otp_wrong", { triesLeft: OTP_MAX_TRIES - row.tries });

  if (!safeEqualHex(codeHash(row.id, row.salt, code), row.code_hash)) {
    const tries = row.tries + 1;
    const left = OTP_MAX_TRIES - tries;
    recordWrongTry(row.id, tries, left <= 0 ? now : null);
    audit({ userId: user.id, actor: user.id, actorType: "user", action: "otp.failed", entityType: "otp", entityId: row.id, details: { purpose: row.purpose, tries }, ts: now });
    if (left <= 0) throw new OtpError(410, "That code isn't right, and that was the last try. Ask for a new code.", "otp_exhausted");
    throw new OtpError(400, `That code isn't right. ${left === 1 ? "1 try" : `${left} tries`} left.`, "otp_wrong", { triesLeft: left });
  }

  markCodeUsed(row.id, now);
  const verificationToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = now + VERIFICATION_TTL_MS;
  insertVerification({ token_hash: sha256(verificationToken), otp_id: row.id, user_id: user.id, purpose: row.purpose, phone: row.phone, created_at: now, expires_at: expiresAt });
  audit({ userId: user.id, actor: user.id, actorType: "user", action: "otp.verified", entityType: "otp", entityId: row.id, details: { purpose: row.purpose }, ts: now });
  return { verificationToken, purpose: row.purpose, expiresAt };
}

/**
 * Uses a verification token for one action. It must be this person's, for this purpose, unused and
 * under 10 minutes old; otherwise 400 `verification_invalid`. Returns the phone number the code went to.
 * Call it inside the action's transaction, so a failed action leaves the token unused.
 */
export function consumeVerification(user: Pick<User, "id">, token: string | null | undefined, purpose: OtpPurpose, now = Date.now()): { phone: string } {
  const invalid = () => new OtpError(400, "That check has expired or was already used. Ask for a new code.", "verification_invalid");
  if (!token || token.length > 200) throw invalid();
  const hash = sha256(token);
  const row = verificationByHash(hash);
  if (!row || row.user_id !== user.id || row.purpose !== purpose || row.used_at !== null || now > row.expires_at) throw invalid();
  if (!spendVerification(hash, now)) throw invalid();
  return { phone: row.phone };
}
