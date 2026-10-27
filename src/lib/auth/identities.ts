import type { DatabaseSync } from "node:sqlite";
import { all, db, get, run } from "../db";

/**
 * Sign-in identities: one row per Firebase uid, pointing at the wallet (user) it opens.
 *   active            full access to user_id (or, with user_id null, signed in with no wallet yet)
 *   recovery_pending  bound through an account-recovery claim; read-only until a person approves
 *   disabled          no access (account closed, or replaced after a recovery)
 * The table, and the users.closed_at column, are created on first use per database.
 */

export type IdentityStatus = "active" | "recovery_pending" | "disabled";

export interface Identity {
  uid: string;
  user_id: string | null;
  email: string | null;
  provider: string;
  status: IdentityStatus;
  created_at: number;
  updated_at: number;
}

const ready = new WeakSet<DatabaseSync>();

export function ensureIdentityTables() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS identities (
    uid TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    provider TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);`);
  // A closed account keeps its data for audit; closed_at marks it.
  const cols = (d.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("closed_at")) d.exec("ALTER TABLE users ADD COLUMN closed_at INTEGER");
  ready.add(d);
}

export function identityByUid(uid: string): Identity | undefined {
  ensureIdentityTables();
  return get<Identity>("SELECT * FROM identities WHERE uid = ?", uid);
}

export function identitiesForUser(userId: string): Identity[] {
  ensureIdentityTables();
  return all<Identity>("SELECT * FROM identities WHERE user_id = ? ORDER BY created_at", userId);
}

/** Creates or re-points an identity. */
export function bindIdentity(i: { uid: string; userId: string | null; email: string | null; provider: string; status: IdentityStatus; at?: number }) {
  ensureIdentityTables();
  const at = i.at ?? Date.now();
  run(
    `INSERT INTO identities (uid, user_id, email, provider, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET user_id = excluded.user_id, email = COALESCE(excluded.email, identities.email),
       provider = excluded.provider, status = excluded.status, updated_at = excluded.updated_at`,
    i.uid,
    i.userId,
    i.email,
    i.provider,
    i.status,
    at,
    at,
  );
}

export function setIdentityStatus(uid: string, status: IdentityStatus, at = Date.now()) {
  ensureIdentityTables();
  run("UPDATE identities SET status = ?, updated_at = ? WHERE uid = ?", status, at, uid);
}

/** Leaves the identity signed in but pointing at no wallet. */
export function unbindIdentity(uid: string, at = Date.now()) {
  ensureIdentityTables();
  run("UPDATE identities SET user_id = NULL, status = 'active', updated_at = ? WHERE uid = ?", at, uid);
}

/** Every other identity for this wallet loses access (after a recovery, or when the account closes). */
export function disableOtherIdentities(userId: string, keepUid: string | null, at = Date.now()) {
  ensureIdentityTables();
  run(
    "UPDATE identities SET status = 'disabled', updated_at = ? WHERE user_id = ? AND (? IS NULL OR uid != ?) AND status != 'disabled'",
    at,
    userId,
    keepUid,
    keepUid,
  );
}

export function isClosed(userId: string): boolean {
  ensureIdentityTables();
  return !!get<{ closed_at: number | null }>("SELECT closed_at FROM users WHERE id = ?", userId)?.closed_at;
}

export function markClosed(userId: string, at = Date.now()) {
  ensureIdentityTables();
  run("UPDATE users SET closed_at = ? WHERE id = ? AND closed_at IS NULL", at, userId);
}
