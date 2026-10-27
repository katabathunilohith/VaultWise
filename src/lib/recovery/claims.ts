import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { all, db, get, run, tx } from "../db";
import { audit } from "../audit";
import { identityByUid, unbindIdentity } from "../auth/identities";

/**
 * recovery_claims: a new sign-in asking to take over an existing wallet by proving the same ID.
 *   pending → approved (a person confirmed) | rejected | cancelled (by the claimant) | expired (7 days, nobody decided)
 * Also holds recovery_attempts, the rate-limit log for the unauthenticated routes.
 */

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

export interface ClaimRow {
  id: string;
  claimant_uid: string;
  claimant_email: string | null;
  user_id: string;
  doc_type: string;
  id_last4: string | null;
  status: ClaimStatus;
  checks: string | null;
  reasons: string | null;
  file_path: string | null;
  /** 1 when the automated checks passed and the claimant got read-only access at once; 0 = access only after approval. */
  provisional: number;
  created_at: number;
  decided_at: number | null;
  decided_by: string | null;
}

export const CLAIM_TTL_MS = 7 * 86_400_000;

const ready = new WeakSet<DatabaseSync>();

export function ensureRecoveryTables() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS recovery_claims (
    id TEXT PRIMARY KEY,
    claimant_uid TEXT NOT NULL,
    claimant_email TEXT,
    user_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    id_last4 TEXT,
    status TEXT NOT NULL,
    checks TEXT,
    reasons TEXT,
    file_path TEXT,
    provisional INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    decided_at INTEGER,
    decided_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_claims_uid ON recovery_claims(claimant_uid, created_at);
  CREATE INDEX IF NOT EXISTS idx_claims_status ON recovery_claims(status, created_at);
  CREATE TABLE IF NOT EXISTS recovery_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts ON recovery_attempts(bucket, client_key, ts);`);
  const cols = (d.prepare("PRAGMA table_info(recovery_claims)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("provisional")) d.exec("ALTER TABLE recovery_claims ADD COLUMN provisional INTEGER NOT NULL DEFAULT 0");
  // One pending claim per sign-in, enforced by the database so parallel requests can't both succeed.
  d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_one_pending ON recovery_claims(claimant_uid) WHERE status = 'pending'");
  ready.add(d);
}

export function claimById(id: string) {
  ensureRecoveryTables();
  return get<ClaimRow>("SELECT * FROM recovery_claims WHERE id = ?", id);
}

export function latestClaimFor(uid: string) {
  ensureRecoveryTables();
  return get<ClaimRow>("SELECT * FROM recovery_claims WHERE claimant_uid = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", uid);
}

export function pendingClaimFor(uid: string) {
  ensureRecoveryTables();
  return get<ClaimRow>("SELECT * FROM recovery_claims WHERE claimant_uid = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1", uid);
}

/**
 * An ID photo is kept only while a person may need it. Once a claim is rejected, cancelled or expired
 * the photo is deleted and the row keeps last 4 + checks (see README for retention).
 */
export function deleteClaimPhoto(c: Pick<ClaimRow, "id" | "file_path">) {
  if (!c.file_path) return;
  fs.rmSync(c.file_path, { force: true });
  run("UPDATE recovery_claims SET file_path = NULL WHERE id = ?", c.id);
}

function expire(c: ClaimRow, now: number) {
  tx(() => {
    run("UPDATE recovery_claims SET status = 'expired', decided_at = ?, decided_by = 'system:expiry' WHERE id = ? AND status = 'pending'", now, c.id);
    deleteClaimPhoto(c);
    const identity = identityByUid(c.claimant_uid);
    if (identity?.status === "recovery_pending" && identity.user_id === c.user_id) unbindIdentity(c.claimant_uid, now);
    audit({
      userId: c.user_id,
      actor: "recovery",
      actorType: "system",
      action: "recovery.claim_expired",
      entityType: "recovery_claim",
      entityId: c.id,
      details: { days: CLAIM_TTL_MS / 86_400_000 },
      ts: now,
    });
  });
}

/** Lapses every pending claim older than 7 days; the claimant loses the read-only access. */
export function expireClaims(now = Date.now()) {
  ensureRecoveryTables();
  const stale = all<ClaimRow>("SELECT * FROM recovery_claims WHERE status = 'pending' AND created_at <= ?", now - CLAIM_TTL_MS);
  for (const c of stale) expire(c, now);
  return stale.length;
}

/** The same, for one sign-in (called while resolving a recovery_pending identity). */
export function settleExpiredClaimFor(uid: string, now = Date.now()) {
  ensureRecoveryTables();
  const stale = all<ClaimRow>("SELECT * FROM recovery_claims WHERE claimant_uid = ? AND status = 'pending' AND created_at <= ?", uid, now - CLAIM_TTL_MS);
  for (const c of stale) expire(c, now);
  // A recovery_pending identity with no pending claim at all (e.g. data cleared) has nothing to wait for.
  const identity = identityByUid(uid);
  if (identity?.status === "recovery_pending" && !pendingClaimFor(uid)) unbindIdentity(uid, now);
}
