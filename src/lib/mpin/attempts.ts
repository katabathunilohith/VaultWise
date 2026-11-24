import type { DatabaseSync } from "node:sqlite";
import { db, get, run } from "../db";
import { LOCK_STEPS_MS, mpinEnforced, TRIES_PER_LOCK } from "./config";
import { alertMpinLocked } from "../alerts"; // alerts

/**
 * Wrong-MPIN counting and the escalating lock, per user on the server.
 *
 * 5 wrong tries lock money moves for 1 minute; each further 5 lock for 5 minutes, then 30 minutes,
 * then 24 hours (and stay at 24 hours). Tries made while locked are refused without checking the
 * PIN and aren't counted. A right MPIN resets the count.
 */

/* ---------- Pure rules ---------- */

/** How long a lock lasts once `failures` wrong tries are counted; null when this try doesn't lock. */
export function lockMsAfter(failures: number): number | null {
  if (failures <= 0 || failures % TRIES_PER_LOCK !== 0) return null;
  const step = failures / TRIES_PER_LOCK - 1;
  return LOCK_STEPS_MS[Math.min(step, LOCK_STEPS_MS.length - 1)];
}

/** Wrong tries left before the next lock, with `failures` counted so far. */
export function triesLeftAfter(failures: number): number {
  return TRIES_PER_LOCK - (failures % TRIES_PER_LOCK);
}

/* ---------- Storage ---------- */

const ready = new WeakSet<DatabaseSync>();

/** Creates the table on first use, per database (a reset replaces the database). */
export function ensureAttemptsTable() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS mpin_attempts (
    user_id TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    updated_at INTEGER NOT NULL
  );`);
  // Inside a transaction the CREATE could still be rolled back, so only remember it once committed.
  if (!d.isTransaction) ready.add(d);
}

export interface AttemptState {
  failures: number;
  /** Ms since epoch; may be in the past (an old lock). */
  lockedUntil: number | null;
}

export function attemptState(userId: string): AttemptState {
  ensureAttemptsTable();
  const row = get<{ failures: number; locked_until: number | null }>("SELECT failures, locked_until FROM mpin_attempts WHERE user_id = ?", userId);
  return { failures: row?.failures ?? 0, lockedUntil: row?.locked_until ?? null };
}

/** The unlock time when money moves are locked right now, else null. */
export function activeLock(userId: string, now = Date.now()): number | null {
  const { lockedUntil } = attemptState(userId);
  return lockedUntil !== null && lockedUntil > now ? lockedUntil : null;
}

/** Counts a wrong try. `lockedUntil` is set when this try starts a lock. */
export function recordFailure(userId: string, now = Date.now()): { failures: number; triesLeft: number; lockedUntil: number | null } {
  ensureAttemptsTable();
  const failures = attemptState(userId).failures + 1;
  const lockMs = lockMsAfter(failures);
  const lockedUntil = lockMs === null ? null : now + lockMs;
  run(
    `INSERT INTO mpin_attempts (user_id, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET failures = excluded.failures,
       locked_until = COALESCE(excluded.locked_until, mpin_attempts.locked_until), updated_at = excluded.updated_at`,
    userId,
    failures,
    lockedUntil,
    now,
  );
  // alerts: the lock always holds for the checks that run whatever MPIN_ENFORCED says (changing the PIN, the
  // phone number, devices), and for money moves too while it is on, so the person is always told.
  if (lockMs !== null) alertMpinLocked(userId, lockMs, mpinEnforced());
  return { failures, triesLeft: lockedUntil === null ? triesLeftAfter(failures) : 0, lockedUntil };
}

/** A right MPIN (or a new one) clears the count and any lock. */
export function recordSuccess(userId: string, now = Date.now()) {
  ensureAttemptsTable();
  run("UPDATE mpin_attempts SET failures = 0, locked_until = NULL, updated_at = ? WHERE user_id = ? AND (failures > 0 OR locked_until IS NOT NULL)", now, userId);
}
