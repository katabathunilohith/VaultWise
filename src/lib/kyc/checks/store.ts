import type { DatabaseSync } from "node:sqlite";
import { all, db, get, newId, run } from "../../db";
import type { NameMatch } from "../names";
import { ensureKycTables } from "../store";
import type { CheckStep } from "./types";

/**
 * kyc_checks: one row per try of a step. The newest row for a step (made after the last rejection)
 * says where that step is. Holds last 4 characters, the PAN's HMAC, and names only where the rules allow
 * (see README.md). Never a full PAN, Aadhaar or account number.
 */
export type CheckRowStatus = "started" | "done" | "review" | "failed" | "expired";

export interface CheckRow {
  id: string;
  user_id: string;
  step: CheckStep;
  status: CheckRowStatus;
  provider: string;
  /** The provider's request id (DigiLocker, reverse penny drop), used by the finish routes. */
  request_id: string | null;
  last4: string | null;
  /** PAN only: HMAC-SHA256(IDENTITY_SECRET, "pan:<number>"), the same as kyc_records.id_hash. */
  id_hash: string | null;
  /** Aadhaar name, bank holder name, or the PAN's name only when it went to a person. */
  name: string | null;
  year_of_birth: number | null;
  name_match: NameMatch | null;
  bank_account_id: string | null;
  /** JSON array of plain sentences the customer may see. */
  reasons: string | null;
  /** For the reviewer only (in the check line), never shown to the customer: e.g. the PAN is on another account. */
  review_note: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

const ready = new WeakSet<DatabaseSync>();

export function ensureChecksTables() {
  const d = db();
  if (ready.has(d)) return;
  ensureKycTables(); // kyc_records (reset after a rejection) and users.closed_at (duplicate PANs)
  d.exec(`CREATE TABLE IF NOT EXISTS kyc_checks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    step TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    request_id TEXT,
    last4 TEXT,
    id_hash TEXT,
    name TEXT,
    year_of_birth INTEGER,
    name_match TEXT,
    bank_account_id TEXT,
    reasons TEXT,
    review_note TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_kyc_checks_user ON kyc_checks(user_id, step, created_at);
  CREATE INDEX IF NOT EXISTS idx_kyc_checks_hash ON kyc_checks(id_hash);`);
  const cols = (d.prepare("PRAGMA table_info(kyc_checks)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("review_note")) d.exec("ALTER TABLE kyc_checks ADD COLUMN review_note TEXT");
  ready.add(d);
}

/** Reserves a try before any provider call, so parallel tries and the daily limit see it. */
export function insertCheck(r: { userId: string; step: CheckStep; provider: string; requestId?: string | null; expiresAt?: number | null; at?: number }): string {
  ensureChecksTables();
  const id = newId("chk");
  // Always after the last rejection, even within the same millisecond, so a new try counts.
  const at = Math.max(r.at ?? Date.now(), resetAt(r.userId) + 1);
  run(
    `INSERT INTO kyc_checks (id, user_id, step, status, provider, request_id, reasons, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, 'started', ?, ?, '[]', ?, ?, ?)`,
    id,
    r.userId,
    r.step,
    r.provider,
    r.requestId ?? null,
    r.expiresAt ?? null,
    at,
    at,
  );
  return id;
}

export function setRequest(id: string, requestId: string, expiresAt: number | null) {
  ensureChecksTables();
  run("UPDATE kyc_checks SET request_id = ?, expires_at = ? WHERE id = ? AND status = 'started'", requestId, expiresAt, id);
}

/** Records a try's outcome. False when it was already settled (a parallel finish won). */
export function completeCheck(
  id: string,
  r: {
    status: Exclude<CheckRowStatus, "started">;
    last4?: string | null;
    idHash?: string | null;
    name?: string | null;
    yearOfBirth?: number | null;
    nameMatch?: NameMatch | null;
    bankAccountId?: string | null;
    reasons?: string[];
    reviewNote?: string | null;
  },
): boolean {
  ensureChecksTables();
  const res = run(
    `UPDATE kyc_checks SET status = ?, last4 = ?, id_hash = ?, name = ?, year_of_birth = ?, name_match = ?, bank_account_id = ?, reasons = ?, review_note = ?, updated_at = ?
     WHERE id = ? AND status = 'started'`,
    r.status,
    r.last4 ?? null,
    r.idHash ?? null,
    r.name ?? null,
    r.yearOfBirth ?? null,
    r.nameMatch ?? null,
    r.bankAccountId ?? null,
    JSON.stringify(r.reasons ?? []),
    r.reviewNote ?? null,
    Date.now(),
    id,
  );
  return Number(res.changes) > 0;
}

/** Drops a reserved try whose provider call failed (the provider's fault, so it doesn't count). */
export function deleteCheck(id: string) {
  ensureChecksTables();
  run("DELETE FROM kyc_checks WHERE id = ? AND status = 'started'", id);
}

/** Older open requests for a step stop counting once a new one starts. */
export function expireOpen(userId: string, step: CheckStep) {
  ensureChecksTables();
  run("UPDATE kyc_checks SET status = 'expired', updated_at = ? WHERE user_id = ? AND step = ? AND status = 'started'", Date.now(), userId, step);
}

export function expireCheck(id: string) {
  ensureChecksTables();
  run("UPDATE kyc_checks SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'started'", Date.now(), id);
}

/** The newest try of a step made after `since` (ms). */
export function latestCheck(userId: string, step: CheckStep, since: number) {
  ensureChecksTables();
  return get<CheckRow>(
    "SELECT * FROM kyc_checks WHERE user_id = ? AND step = ? AND created_at > ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    userId,
    step,
    since,
  );
}

export function checkByRequest(userId: string, step: CheckStep, requestId: string) {
  ensureChecksTables();
  return get<CheckRow>("SELECT * FROM kyc_checks WHERE user_id = ? AND step = ? AND request_id = ? ORDER BY created_at DESC LIMIT 1", userId, step, requestId);
}

export function triesSince(userId: string, step: CheckStep, since: number) {
  ensureChecksTables();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM kyc_checks WHERE user_id = ? AND step = ? AND created_at > ?", userId, step, since)!.n;
}

/** Other open accounts whose PAN step used this HMAC (done or with a person). */
export function otherPanHolders(hash: string, userId: string) {
  ensureChecksTables();
  return all<{ user_id: string }>(
    `SELECT DISTINCT c.user_id FROM kyc_checks c JOIN users u ON u.id = c.user_id
     WHERE c.step = 'pan' AND c.id_hash = ? AND c.user_id != ? AND c.status IN ('done', 'review') AND u.closed_at IS NULL`,
    hash,
    userId,
  );
}

/** When a person last rejected this account's ID check. Steps tried before then start again. */
export function resetAt(userId: string): number {
  ensureChecksTables();
  return get<{ t: number | null }>("SELECT MAX(COALESCE(decided_at, created_at)) AS t FROM kyc_records WHERE user_id = ? AND status = 'rejected'", userId)?.t ?? 0;
}
