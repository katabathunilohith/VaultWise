import type { DatabaseSync } from "node:sqlite";
import { db, get, run } from "../db";
import { audit } from "../audit";
import type { User } from "../users";
import { alertPhoneVerified, durationText } from "../alerts";
import { PHONE_RESET_HOLD_MS } from "./config";
import { OtpError } from "./errors";

/**
 * The person's phone number. Stored on `users` (columns `phone`, `phone_verified_at`), which this
 * module adds on first use rather than through db.ts, so it can be removed with the module. A number
 * is only ever stored once a texted code proved it, so `phone` set means verified.
 */

const ready = new WeakSet<DatabaseSync>();

export function ensurePhoneColumns() {
  const d = db();
  if (ready.has(d)) return;
  const cols = (d.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("phone")) d.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  if (!cols.includes("phone_verified_at")) d.exec("ALTER TABLE users ADD COLUMN phone_verified_at INTEGER");
  // Inside a transaction the ALTER could still be rolled back, so only remember it once committed.
  if (!d.isTransaction) ready.add(d);
}

const E164 = /^\+[1-9]\d{7,14}$/;

/** "+91 98765-43210" → "+919876543210"; null when it isn't a full international number. */
export function normalisePhone(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/[\s().-]/g, "");
  return E164.test(s) ? s : null;
}

/** "+919876543210" → "+91••••••3210": enough to recognise, not enough to call. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}${"•".repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}

/** The verified number, or null. */
export function verifiedPhone(userId: string): string | null {
  ensurePhoneColumns();
  const r = get<{ phone: string | null; phone_verified_at: number | null }>("SELECT phone, phone_verified_at FROM users WHERE id = ?", userId);
  return r?.phone && r.phone_verified_at ? r.phone : null;
}

/** What GET /me reports: the masked number and whether it is verified. */
export function phoneStatus(userId: string): { number: string | null; verified: boolean } {
  const p = verifiedPhone(userId);
  return { number: p ? maskPhone(p) : null, verified: !!p };
}

/** When the verified number was added or last changed (ms), or null without one. */
export function phoneChangedAt(userId: string): number | null {
  ensurePhoneColumns();
  const r = get<{ phone: string | null; phone_verified_at: number | null }>("SELECT phone, phone_verified_at FROM users WHERE id = ?", userId);
  return r?.phone && r.phone_verified_at ? r.phone_verified_at : null;
}

/**
 * A texted code can reset the MPIN only once the verified number has been on the account for 72 hours,
 * so someone who got in and put their own number on the account can't use it to take over the MPIN
 * before the owner sees the `phone_verified` alert. 403 `phone_recently_changed` with `allowedAt` (ms).
 * No verified number: nothing to check here (sending the code answers 409 `phone_required`).
 */
export function assertPhoneSettled(userId: string, now = Date.now()) {
  const changed = phoneChangedAt(userId);
  if (changed === null) return;
  const allowedAt = changed + PHONE_RESET_HOLD_MS;
  if (now >= allowedAt) return;
  throw new OtpError(
    403,
    `Your phone number was added or changed recently, so for your safety it can't be used to reset your MPIN for the next ${durationText(allowedAt - now)}. If you didn't change it, contact support.`,
    "phone_recently_changed",
    { allowedAt },
  );
}

/**
 * Stores a number a texted code just proved; audits it (masked) and raises a `phone_verified` alert.
 * Proving the number that is already verified changes nothing (and doesn't restart the 72-hour hold).
 */
export function setVerifiedPhone(user: Pick<User, "id">, phone: string, now = Date.now()) {
  ensurePhoneColumns();
  const before = verifiedPhone(user.id);
  if (before === phone) return;
  run("UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?", phone, now, user.id);
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "phone.verified",
    entityType: "user",
    entityId: user.id,
    details: { phone: maskPhone(phone), replaced: before ? maskPhone(before) : null },
    ts: now,
  });
  alertPhoneVerified(user.id, maskPhone(phone), PHONE_RESET_HOLD_MS);
}
