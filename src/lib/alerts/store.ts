import type { DatabaseSync } from "node:sqlite";
import { all, db, get, run } from "../db";
import { MAX_PUSH_TOKENS_PER_USER } from "./config";

/** What an alert is about. The phone may show an icon per kind; new kinds are added here. */
export const ALERT_KINDS = [
  "new_device",
  "device_trusted",
  "device_revoked",
  "money_out",
  "limit_loosened",
  "mpin_locked",
  "mpin_changed",
  "phone_verified",
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

export interface Alert {
  id: string;
  userId: string;
  kind: AlertKind;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

interface AlertRow {
  id: string;
  user_id: string;
  kind: AlertKind;
  title: string;
  body: string;
  created_at: number;
  read_at: number | null;
}

export type PushPlatform = "ios" | "android" | "web";

export interface PushToken {
  token: string;
  userId: string;
  platform: PushPlatform;
  deviceId: string | null;
}

const ready = new WeakSet<DatabaseSync>();

/** Creates the alerts and push-token tables on first use, per database (a reset replaces the database). */
export function ensureAlertTables() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, created_at);
  CREATE TABLE IF NOT EXISTS push_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    device_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id, updated_at);`);
  // Inside a transaction the CREATE could still be rolled back, so only remember it once committed.
  if (!d.isTransaction) ready.add(d);
}

const toAlert = (r: AlertRow): Alert => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  createdAt: r.created_at,
  readAt: r.read_at,
});

export function insertAlert(a: Alert) {
  ensureAlertTables();
  run(
    "INSERT INTO alerts (id, user_id, kind, title, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    a.id,
    a.userId,
    a.kind,
    a.title,
    a.body,
    a.createdAt,
    a.readAt,
  );
}

export function alertExists(id: string): boolean {
  ensureAlertTables();
  return !!get<{ id: string }>("SELECT id FROM alerts WHERE id = ?", id);
}

/** The person's newest alerts first; only unread ones with `unreadOnly`. */
export function listAlerts(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Alert[] {
  ensureAlertTables();
  const rows = all<AlertRow>(
    `SELECT * FROM alerts WHERE user_id = ? ${opts.unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    userId,
    opts.limit ?? 50,
  );
  return rows.map(toAlert);
}

export function unreadCount(userId: string): number {
  ensureAlertTables();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND read_at IS NULL", userId)?.n ?? 0;
}

/** Marks the given alerts (only this person's), or all of them when `ids` is missing, as read. */
export function markRead(userId: string, ids?: string[], now = Date.now()): number {
  ensureAlertTables();
  if (ids === undefined) return Number(run("UPDATE alerts SET read_at = ? WHERE user_id = ? AND read_at IS NULL", now, userId).changes);
  let changed = 0;
  for (const id of new Set(ids))
    changed += Number(run("UPDATE alerts SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL", now, id, userId).changes);
  return changed;
}

/* ---------- Push tokens ---------- */

/**
 * Stores a push token for this person. A token belongs to one installation, so a token seen before
 * (the phone signed into another account) moves to this person. Keeps the newest few per person.
 */
export function savePushToken(t: PushToken, now = Date.now()) {
  ensureAlertTables();
  run(
    `INSERT INTO push_tokens (token, user_id, platform, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform,
       device_id = excluded.device_id, updated_at = excluded.updated_at`,
    t.token,
    t.userId,
    t.platform,
    t.deviceId,
    now,
    now,
  );
  run(
    `DELETE FROM push_tokens WHERE user_id = ? AND token NOT IN
       (SELECT token FROM push_tokens WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?)`,
    t.userId,
    t.userId,
    MAX_PUSH_TOKENS_PER_USER,
  );
}

export function pushTokensFor(userId: string): PushToken[] {
  ensureAlertTables();
  return all<{ token: string; user_id: string; platform: PushPlatform; device_id: string | null }>(
    "SELECT token, user_id, platform, device_id FROM push_tokens WHERE user_id = ? ORDER BY updated_at DESC",
    userId,
  ).map((r) => ({ token: r.token, userId: r.user_id, platform: r.platform, deviceId: r.device_id }));
}

export function hasPushTokens(userId: string): boolean {
  ensureAlertTables();
  return !!get<{ token: string }>("SELECT token FROM push_tokens WHERE user_id = ? LIMIT 1", userId);
}

/** Removes one token (Expo said the app was uninstalled, or the phone signed out). Only this person's when `userId` is given. */
export function removePushToken(token: string, userId?: string) {
  ensureAlertTables();
  if (userId) run("DELETE FROM push_tokens WHERE token = ? AND user_id = ?", token, userId);
  else run("DELETE FROM push_tokens WHERE token = ?", token);
}

/** A signed-out (revoked) device stops getting this person's notifications. */
export function removePushTokensForDevice(userId: string, deviceId: string) {
  ensureAlertTables();
  run("DELETE FROM push_tokens WHERE user_id = ? AND device_id = ?", userId, deviceId);
}

/** The JSON shape routes send for an alert. */
export function alertView(a: Alert) {
  return { id: a.id, kind: a.kind, title: a.title, body: a.body, createdAt: a.createdAt, readAt: a.readAt };
}
