import type { DatabaseSync } from "node:sqlite";
import { all, db, get, run } from "../db";

/** A device (one app installation) that has used a person's account. */
export interface Device {
  id: string;
  userId: string;
  /** The app's install id, from the `x-device-id` header. */
  installId: string;
  platform: "ios" | "android" | "web" | null;
  appVersion: string | null;
  firstSeen: number;
  lastSeen: number;
  trustedAt: number | null;
  revokedAt: number | null;
  /**
   * Whether it trusts itself 24 hours after it was first seen. False for a device first seen after a
   * device was signed out of the account: only a texted code and the MPIN trust it.
   */
  coolsDown: boolean;
}

interface DeviceRow {
  id: string;
  user_id: string;
  install_id: string;
  platform: Device["platform"];
  app_version: string | null;
  first_seen: number;
  last_seen: number;
  trusted_at: number | null;
  revoked_at: number | null;
  cool_down: number;
}

const ready = new WeakSet<DatabaseSync>();

/**
 * Creates the table on first use, per database (a reset replaces the database), adds the columns later
 * versions need (`devices.cool_down`), and the account-level `users.devices_revoked_at` (when a device
 * was last signed out of the account).
 */
export function ensureDevicesTable() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    install_id TEXT NOT NULL,
    platform TEXT,
    app_version TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    trusted_at INTEGER,
    revoked_at INTEGER,
    cool_down INTEGER NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_install ON devices(user_id, install_id);
  CREATE INDEX IF NOT EXISTS idx_devices_user_seen ON devices(user_id, first_seen);`);
  const deviceCols = (d.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).map((c) => c.name);
  if (!deviceCols.includes("cool_down")) d.exec("ALTER TABLE devices ADD COLUMN cool_down INTEGER NOT NULL DEFAULT 1");
  const userCols = (d.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!userCols.includes("devices_revoked_at")) d.exec("ALTER TABLE users ADD COLUMN devices_revoked_at INTEGER");
  // Inside a transaction the CREATE could still be rolled back, so only remember it once committed.
  if (!d.isTransaction) ready.add(d);
}

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  userId: r.user_id,
  installId: r.install_id,
  platform: r.platform,
  appVersion: r.app_version,
  firstSeen: r.first_seen,
  lastSeen: r.last_seen,
  trustedAt: r.trusted_at,
  revokedAt: r.revoked_at,
  coolsDown: r.cool_down !== 0,
});

export function deviceByInstall(userId: string, installId: string): Device | null {
  ensureDevicesTable();
  const r = get<DeviceRow>("SELECT * FROM devices WHERE user_id = ? AND install_id = ?", userId, installId);
  return r ? toDevice(r) : null;
}

export function deviceById(userId: string, id: string): Device | null {
  ensureDevicesTable();
  const r = get<DeviceRow>("SELECT * FROM devices WHERE user_id = ? AND id = ?", userId, id);
  return r ? toDevice(r) : null;
}

/** Every device the account has ever had, signed-out ones included. */
export function deviceCount(userId: string): number {
  ensureDevicesTable();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE user_id = ?", userId)?.n ?? 0;
}

/** Devices first seen after `since` (signed-out ones included), for the new-device limit. */
export function devicesFirstSeenSince(userId: string, since: number): number {
  ensureDevicesTable();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND first_seen > ?", userId, since)?.n ?? 0;
}

/** Devices still signed in. */
export function activeDeviceCount(userId: string): number {
  ensureDevicesTable();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND revoked_at IS NULL", userId)?.n ?? 0;
}

/** Devices still signed in, most recently used first. */
export function activeDevices(userId: string): Device[] {
  ensureDevicesTable();
  return all<DeviceRow>("SELECT * FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen DESC, first_seen DESC", userId).map(toDevice);
}

/** Records a device seen for the first time. False when another request recorded it a moment earlier. */
export function insertDevice(d: Device): boolean {
  ensureDevicesTable();
  const r = run(
    `INSERT OR IGNORE INTO devices (id, user_id, install_id, platform, app_version, first_seen, last_seen, trusted_at, revoked_at, cool_down)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    d.id,
    d.userId,
    d.installId,
    d.platform,
    d.appVersion,
    d.firstSeen,
    d.lastSeen,
    d.trustedAt,
    d.revokedAt,
    d.coolsDown ? 1 : 0,
  );
  return Number(r.changes) > 0;
}

export function markSeen(id: string, now: number, platform: Device["platform"], appVersion: string | null) {
  run("UPDATE devices SET last_seen = ?, platform = COALESCE(?, platform), app_version = COALESCE(?, app_version) WHERE id = ?", now, platform, appVersion, id);
}

export function markTrusted(id: string, now: number) {
  run("UPDATE devices SET trusted_at = ? WHERE id = ? AND trusted_at IS NULL", now, id);
}

export function markRevoked(id: string, now: number) {
  run("UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now, id);
}

/* ---------- The account ---------- */

/** When a device was last signed out of this account, or null if never. */
export function accountRevokedAt(userId: string): number | null {
  ensureDevicesTable();
  return get<{ t: number | null }>("SELECT devices_revoked_at AS t FROM users WHERE id = ?", userId)?.t ?? null;
}

export function markAccountRevoked(userId: string, now: number) {
  ensureDevicesTable();
  run("UPDATE users SET devices_revoked_at = MAX(COALESCE(devices_revoked_at, 0), ?) WHERE id = ?", now, userId);
}

/**
 * When the wallet was really opened (wall-clock time): its first ledger account's `created_at`.
 * `users.created_at` can't be used for this, because the practice data back-dates it by months so the
 * history looks lived-in. Falls back to `users.created_at` for a wallet with no ledger account.
 */
export function walletOpenedAt(userId: string): number | null {
  const r = get<{ t: number | null }>(
    "SELECT COALESCE((SELECT MIN(created_at) FROM accounts WHERE user_id = ?), (SELECT created_at FROM users WHERE id = ?)) AS t",
    userId,
    userId,
  );
  return r?.t ?? null;
}
