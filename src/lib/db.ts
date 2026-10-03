import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const DATA_DIR = process.env.VAULTWISE_DATA_DIR || path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "vaultwise.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  jurisdiction TEXT NOT NULL,
  currency TEXT NOT NULL,
  kyc_status TEXT NOT NULL DEFAULT 'verified',
  kyc_level INTEGER NOT NULL DEFAULT 2,
  pin_hash TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  risk_profile TEXT,
  satellite_opt_in INTEGER NOT NULL DEFAULT 0,
  satellite_opted_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  ref_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id, kind);

CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  memo TEXT,
  ref_type TEXT,
  ref_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journals_user ON journals(user_id, created_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_account ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_entries_journal ON ledger_entries(journal_id);

-- Read-model projection of ledger_entries; reconciled against a full replay.
CREATE TABLE IF NOT EXISTS balances (
  account_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  target_date TEXT,
  rule_type TEXT NOT NULL DEFAULT 'none',
  rule_amount INTEGER,
  rule_percent REAL,
  rule_frequency TEXT,
  next_run_at INTEGER,
  is_joint INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'locked',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_members (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  contributed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payee TEXT,
  note TEXT,
  status TEXT NOT NULL,
  proof_id TEXT,
  decision_reason TEXT,
  journal_id TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  vault_id TEXT,
  withdrawal_id TEXT,
  emergency_id TEXT,
  purpose TEXT NOT NULL,
  category TEXT NOT NULL,
  file_name TEXT,
  mime TEXT,
  size INTEGER,
  sha256 TEXT,
  phash TEXT,
  stored_path TEXT,
  ela_path TEXT,
  exif TEXT,
  extracted TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  proof_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  stages TEXT NOT NULL,
  confidence REAL,
  decision TEXT,
  final_decision TEXT,
  reasons TEXT,
  model_version TEXT,
  reviewer TEXT,
  reviewer_note TEXT,
  appeal_note TEXT,
  queued_at INTEGER,
  decided_at INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS emergency_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  note TEXT,
  tier INTEGER NOT NULL,
  plan TEXT NOT NULL,
  guardrails TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  release_at INTEGER,
  released_at INTEGER,
  receipt_status TEXT NOT NULL DEFAULT 'not_required',
  receipt_due_at INTEGER,
  receipt_proof_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  source TEXT NOT NULL,
  ref_id TEXT,
  severity TEXT NOT NULL,
  score INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

-- Append-only, hash-chained audit log.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  user_id TEXT,
  actor TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  direction TEXT NOT NULL,
  roundup INTEGER NOT NULL DEFAULT 0,
  roundup_status TEXT NOT NULL DEFAULT 'none',
  journal_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS external_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  institution TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mask TEXT NOT NULL,
  balance INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sip_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  next_run_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS holdings (
  user_id TEXT NOT NULL,
  sleeve TEXT NOT NULL,
  symbol TEXT NOT NULL,
  units REAL NOT NULL,
  cost INTEGER NOT NULL,
  PRIMARY KEY (user_id, sleeve, symbol)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sleeve TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  units REAL NOT NULL,
  price REAL NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  params TEXT NOT NULL,
  stage TEXT NOT NULL,
  last_backtest TEXT,
  paper_started_at INTEGER,
  promoted_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry REAL NOT NULL,
  stop REAL NOT NULL,
  target REAL NOT NULL,
  risk_amount INTEGER NOT NULL,
  confluence INTEGER NOT NULL,
  components TEXT,
  bar_time INTEGER NOT NULL,
  status TEXT NOT NULL,
  exit REAL,
  r_multiple REAL,
  pnl INTEGER,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS paper_state (
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_bar_t INTEGER NOT NULL,
  halted_until INTEGER,
  PRIMARY KEY (user_id, symbol, timeframe)
);

CREATE TABLE IF NOT EXISTS market_cache (
  key TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;

declare global {
  var __vaultwiseDb: DatabaseSync | undefined;
  var __vaultwiseTxDepth: number | undefined;
}

function open(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  d.exec(SCHEMA);
  return d;
}

export function db(): DatabaseSync {
  if (!globalThis.__vaultwiseDb) globalThis.__vaultwiseDb = open();
  return globalThis.__vaultwiseDb;
}

/** Wipes the database file and uploads. Used by "reset demo". */
export function destroyDatabase() {
  if (globalThis.__vaultwiseDb) {
    globalThis.__vaultwiseDb.close();
    globalThis.__vaultwiseDb = undefined;
  }
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
}

type Params = SQLInputValue[];

export function all<T>(sql: string, ...params: Params): T[] {
  return db()
    .prepare(sql)
    .all(...params) as T[];
}

export function get<T>(sql: string, ...params: Params): T | undefined {
  return db()
    .prepare(sql)
    .get(...params) as T | undefined;
}

export function run(sql: string, ...params: Params) {
  return db()
    .prepare(sql)
    .run(...params);
}

/** Runs fn inside a transaction. Nested calls join the outer transaction. */
export function tx<T>(fn: () => T): T {
  const depth = globalThis.__vaultwiseTxDepth ?? 0;
  if (depth > 0) {
    globalThis.__vaultwiseTxDepth = depth + 1;
    try {
      return fn();
    } finally {
      globalThis.__vaultwiseTxDepth = depth;
    }
  }
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  globalThis.__vaultwiseTxDepth = 1;
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    globalThis.__vaultwiseTxDepth = 0;
  }
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
