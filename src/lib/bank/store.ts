import type { DatabaseSync } from "node:sqlite";
import { db, get, newId, run } from "../db";

/**
 * bank_accounts: a person's bank account, as a provider read it from a ₹1 reverse penny drop.
 * Holds the IFSC, the last 4 digits and the holder's name. Never the full account number.
 */
export interface BankAccountRow {
  id: string;
  user_id: string;
  ifsc: string;
  account_last4: string;
  holder_name: string;
  /** When the provider confirmed the account (the payment arrived from it). */
  verified_at: number | null;
  /** The provider's request id, for support. */
  provider_ref: string | null;
  created_at: number;
}

const ready = new WeakSet<DatabaseSync>();

export function ensureBankTables() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ifsc TEXT NOT NULL,
    account_last4 TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    verified_at INTEGER,
    provider_ref TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id, created_at);`);
  ready.add(d);
}

export function insertBankAccount(r: { userId: string; ifsc: string; last4: string; holderName: string; verifiedAt: number | null; providerRef: string | null }): string {
  ensureBankTables();
  const id = newId("bank");
  run(
    `INSERT INTO bank_accounts (id, user_id, ifsc, account_last4, holder_name, verified_at, provider_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    r.userId,
    r.ifsc.toUpperCase(),
    r.last4,
    r.holderName,
    r.verifiedAt,
    r.providerRef,
    Date.now(),
  );
  return id;
}

export function bankAccount(id: string) {
  ensureBankTables();
  return get<BankAccountRow>("SELECT * FROM bank_accounts WHERE id = ?", id);
}

/** The account linked most recently. */
export function latestBankAccount(userId: string) {
  ensureBankTables();
  return get<BankAccountRow>("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", userId);
}

/** Marks an account verified (once). False when it was already verified or doesn't exist. */
export function markBankAccountVerified(id: string, at: number): boolean {
  ensureBankTables();
  return Number(run("UPDATE bank_accounts SET verified_at = ? WHERE id = ? AND verified_at IS NULL", at, id).changes) > 0;
}
