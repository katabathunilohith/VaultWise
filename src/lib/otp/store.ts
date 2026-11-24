import type { DatabaseSync } from "node:sqlite";
import { db, get, run } from "../db";
import type { OtpPurpose } from "./config";

/**
 * Two tables, created on first use:
 * - `otp_codes`: one row per code sent. The code itself is never stored, only an HMAC of it. `new_number` is 1
 *   for a `phone_verify` code to a number the account hadn't verified (what the per-number cap counts).
 * - `otp_verifications`: what a right code gives: a token (stored as its SHA-256), single use, bound
 *   to the person, the purpose and the phone number the code went to.
 */

const ready = new WeakSet<DatabaseSync>();

export function ensureOtpTables() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    phone TEXT NOT NULL,
    salt TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    new_number INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_otp_codes_user ON otp_codes(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone, created_at);
  CREATE TABLE IF NOT EXISTS otp_verifications (
    token_hash TEXT PRIMARY KEY,
    otp_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );`);
  const cols = (d.prepare("PRAGMA table_info(otp_codes)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("new_number")) d.exec("ALTER TABLE otp_codes ADD COLUMN new_number INTEGER NOT NULL DEFAULT 0");
  // Inside a transaction the CREATE could still be rolled back, so only remember it once committed.
  if (!d.isTransaction) ready.add(d);
}

export interface OtpRow {
  id: string;
  user_id: string;
  purpose: OtpPurpose;
  phone: string;
  salt: string;
  code_hash: string;
  tries: number;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  new_number: number;
}

export interface VerificationRow {
  token_hash: string;
  otp_id: string;
  user_id: string;
  purpose: OtpPurpose;
  phone: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

type SendCount = { n: number; oldest: number | null };

function countSends(where: string, args: (string | number)[]): SendCount {
  ensureOtpTables();
  const r = get<SendCount>(`SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM otp_codes WHERE ${where}`, ...args);
  return { n: r?.n ?? 0, oldest: r?.oldest ?? null };
}

/** Codes this person sent since `since`, and the oldest one's time (for `retryAt`). */
export function sendsByUser(userId: string, since: number): SendCount {
  return countSends("user_id = ? AND created_at > ?", [userId, since]);
}

/** Codes this person sent to this number since `since`. */
export function sendsByUserTo(userId: string, phone: string, since: number): SendCount {
  return countSends("user_id = ? AND phone = ? AND created_at > ?", [userId, phone, since]);
}

/** `phone_verify` codes any account sent to this number, while it wasn't that account's verified number, since `since`. */
export function newNumberSendsTo(phone: string, since: number): SendCount {
  return countSends("phone = ? AND new_number = 1 AND created_at > ?", [phone, since]);
}

export function insertCode(r: Omit<OtpRow, "tries" | "used_at">) {
  ensureOtpTables();
  run(
    `INSERT INTO otp_codes (id, user_id, purpose, phone, salt, code_hash, tries, created_at, expires_at, used_at, new_number)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
    r.id,
    r.user_id,
    r.purpose,
    r.phone,
    r.salt,
    r.code_hash,
    r.created_at,
    r.expires_at,
    r.new_number,
  );
}

/** A new code replaces this person's earlier unused codes for the same purpose. */
export function supersedeCodes(userId: string, purpose: OtpPurpose, exceptId: string, now: number) {
  run("UPDATE otp_codes SET used_at = ? WHERE user_id = ? AND purpose = ? AND id != ? AND used_at IS NULL", now, userId, purpose, exceptId);
}

export function codeFor(userId: string, id: string): OtpRow | null {
  ensureOtpTables();
  return get<OtpRow>("SELECT * FROM otp_codes WHERE id = ? AND user_id = ?", id, userId) ?? null;
}

export function recordWrongTry(id: string, tries: number, usedAt: number | null) {
  run("UPDATE otp_codes SET tries = ?, used_at = COALESCE(?, used_at) WHERE id = ?", tries, usedAt, id);
}

export function markCodeUsed(id: string, now: number) {
  run("UPDATE otp_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", now, id);
}

export function insertVerification(v: Omit<VerificationRow, "used_at">) {
  ensureOtpTables();
  run(
    `INSERT INTO otp_verifications (token_hash, otp_id, user_id, purpose, phone, created_at, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    v.token_hash,
    v.otp_id,
    v.user_id,
    v.purpose,
    v.phone,
    v.created_at,
    v.expires_at,
  );
}

export function verificationByHash(tokenHash: string): VerificationRow | null {
  ensureOtpTables();
  return get<VerificationRow>("SELECT * FROM otp_verifications WHERE token_hash = ?", tokenHash) ?? null;
}

/** Marks a token used; false when another request used it first. */
export function spendVerification(tokenHash: string, now: number): boolean {
  return Number(run("UPDATE otp_verifications SET used_at = ? WHERE token_hash = ? AND used_at IS NULL", now, tokenHash).changes) > 0;
}
