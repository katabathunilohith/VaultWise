import type { DatabaseSync } from "node:sqlite";
import { db, get, run } from "../db";
import { MPIN_LENGTH } from "./config";

/**
 * What the server knows about each person's PIN besides its hash: how many digits it has.
 * A scrypt hash doesn't reveal its length, so the length is recorded whenever a PIN is set through
 * this module or typed correctly. Accounts never seen since this module shipped have no row.
 */

const ready = new WeakSet<DatabaseSync>();

export function ensureMetaTable() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS mpin_meta (
    user_id TEXT PRIMARY KEY,
    pin_length INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`);
  if (!d.isTransaction) ready.add(d);
}

export function rememberPinLength(userId: string, length: number, now = Date.now()) {
  ensureMetaTable();
  run(
    `INSERT INTO mpin_meta (user_id, pin_length, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET pin_length = excluded.pin_length, updated_at = excluded.updated_at
     WHERE mpin_meta.pin_length != excluded.pin_length`,
    userId,
    length,
    now,
  );
}

export function knownPinLength(userId: string): number | null {
  ensureMetaTable();
  return get<{ pin_length: number }>("SELECT pin_length FROM mpin_meta WHERE user_id = ?", userId)?.pin_length ?? null;
}

/**
 * True until the server has seen a 6-digit PIN for this person: a known 4- or 5-digit PIN, or an
 * account not seen since this module shipped (most of those have 4-digit PINs). Typing a 6-digit
 * PIN correctly once clears it.
 */
export function upgradeDue(userId: string): boolean {
  return knownPinLength(userId) !== MPIN_LENGTH;
}
