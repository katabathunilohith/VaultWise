import type { DatabaseSync } from "node:sqlite";
import { db, get, run } from "../db";

export type AutoSaveSource = "bank" | "wallet";

export interface WalletSettings {
  /** Minor units a day across spends and cash-outs. Null means no limit. */
  dailyLimit: number | null;
  /** When the limit was last raised or turned off. Raising is allowed once per 30 days. */
  limitRaisedAt: number | null;
  autoSaveSource: AutoSaveSource;
}

export const DEFAULT_SETTINGS: WalletSettings = { dailyLimit: null, limitRaisedAt: null, autoSaveSource: "bank" };

const ready = new WeakSet<DatabaseSync>();

/** Creates the wallet's tables on first use, per database (a reset replaces the database). */
export function ensureWalletTables() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS wallet_settings (
    user_id TEXT PRIMARY KEY,
    daily_limit INTEGER,
    limit_raised_at INTEGER,
    auto_save_source TEXT NOT NULL DEFAULT 'bank'
  );
  CREATE TABLE IF NOT EXISTS wallet_payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    journal_id TEXT NOT NULL,
    payee TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wallet_payments_user ON wallet_payments(user_id, created_at);`);
  // Inside a transaction the CREATE could still be rolled back, so only remember it once committed.
  if (!d.isTransaction) ready.add(d);
}

interface SettingsRow {
  daily_limit: number | null;
  limit_raised_at: number | null;
  auto_save_source: string | null;
}

export function walletSettings(userId: string): WalletSettings {
  ensureWalletTables();
  const row = get<SettingsRow>("SELECT daily_limit, limit_raised_at, auto_save_source FROM wallet_settings WHERE user_id = ?", userId);
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    dailyLimit: row.daily_limit,
    limitRaisedAt: row.limit_raised_at,
    autoSaveSource: row.auto_save_source === "wallet" ? "wallet" : "bank",
  };
}

export function saveWalletSettings(userId: string, s: WalletSettings) {
  ensureWalletTables();
  run(
    `INSERT INTO wallet_settings (user_id, daily_limit, limit_raised_at, auto_save_source) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET daily_limit = excluded.daily_limit, limit_raised_at = excluded.limit_raised_at,
       auto_save_source = excluded.auto_save_source`,
    userId,
    s.dailyLimit,
    s.limitRaisedAt,
    s.autoSaveSource,
  );
}

export function recordPayment(p: { id: string; userId: string; journalId: string; payee: string; note: string | null; at: number }) {
  ensureWalletTables();
  run(
    "INSERT INTO wallet_payments (id, user_id, journal_id, payee, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    p.id,
    p.userId,
    p.journalId,
    p.payee,
    p.note,
    p.at,
  );
}

export function paymentById(id: string) {
  ensureWalletTables();
  return get<{ payee: string; note: string | null }>("SELECT payee, note FROM wallet_payments WHERE id = ?", id);
}
