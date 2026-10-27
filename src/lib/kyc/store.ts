import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { all, db, get, newId, run, UPLOAD_DIR } from "../db";
import { ensureIdentityTables } from "../auth/identities";
import type { DocType } from "./ids";
import type { KycCheck, KycStatus } from "./types";

/** kyc_records: one row per ID check. Holds last 4 + HMAC, never the full number. */
export interface KycRecord {
  id: string;
  user_id: string;
  doc_type: DocType;
  id_last4: string | null;
  id_hash: string | null;
  name_on_doc: string | null;
  dob: string | null;
  status: KycStatus;
  provider: string;
  checks: string | null;
  reasons: string | null;
  file_path: string | null;
  decided_by: string | null;
  decided_at: number | null;
  created_at: number;
}

const ready = new WeakSet<DatabaseSync>();

export function ensureKycTables() {
  const d = db();
  if (ready.has(d)) return;
  ensureIdentityTables(); // users.closed_at, used to skip closed accounts
  d.exec(`CREATE TABLE IF NOT EXISTS kyc_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    id_last4 TEXT,
    id_hash TEXT,
    name_on_doc TEXT,
    dob TEXT,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    checks TEXT,
    reasons TEXT,
    file_path TEXT,
    decided_by TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_records(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_kyc_hash ON kyc_records(id_hash);`);
  ready.add(d);
}

/** Stores an ID image next to proof uploads. Returns the path. */
export function storeIdImage(prefix: string, id: string, file: { buffer: Buffer; mime: string }) {
  const ext = file.mime.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const p = path.join(UPLOAD_DIR, `${prefix}_${id}.${ext}`);
  fs.writeFileSync(p, file.buffer);
  return p;
}

export function insertKycRecord(r: Omit<KycRecord, "id" | "created_at" | "checks" | "reasons"> & { checks: KycCheck[]; reasons: string[]; id?: string; created_at?: number }) {
  ensureKycTables();
  const id = r.id ?? newId("kyc");
  run(
    `INSERT INTO kyc_records (id, user_id, doc_type, id_last4, id_hash, name_on_doc, dob, status, provider, checks, reasons, file_path, decided_by, decided_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    r.user_id,
    r.doc_type,
    r.id_last4,
    r.id_hash,
    r.name_on_doc,
    r.dob,
    r.status,
    r.provider,
    JSON.stringify(r.checks),
    JSON.stringify(r.reasons),
    r.file_path,
    r.decided_by,
    r.decided_at,
    r.created_at ?? Date.now(),
  );
  return id;
}

export function kycRecord(id: string) {
  ensureKycTables();
  return get<KycRecord>("SELECT * FROM kyc_records WHERE id = ?", id);
}

export function latestKycRecord(userId: string) {
  ensureKycTables();
  return get<KycRecord>("SELECT * FROM kyc_records WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", userId);
}

export function latestVerifiedRecord(userId: string) {
  ensureKycTables();
  return get<KycRecord>("SELECT * FROM kyc_records WHERE user_id = ? AND status = 'verified' ORDER BY created_at DESC LIMIT 1", userId);
}

export function kycSubmissionsSince(userId: string, since: number) {
  ensureKycTables();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM kyc_records WHERE user_id = ? AND created_at > ?", userId, since)!.n;
}

/** Records with this hash on other, open accounts (any status except rejected). */
export function otherHolders(hash: string, userId: string) {
  ensureKycTables();
  return all<{ user_id: string; status: string }>(
    `SELECT k.user_id, k.status FROM kyc_records k JOIN users u ON u.id = k.user_id
     WHERE k.id_hash = ? AND k.user_id != ? AND k.status != 'rejected' AND u.closed_at IS NULL`,
    hash,
    userId,
  );
}

/** The open account whose verified ID has this hash (used by account recovery). */
export function verifiedHolder(hash: string) {
  ensureKycTables();
  return get<{ user_id: string; record_id: string; doc_type: string; id_last4: string | null }>(
    `SELECT k.user_id, k.id AS record_id, k.doc_type, k.id_last4 FROM kyc_records k JOIN users u ON u.id = k.user_id
     WHERE k.id_hash = ? AND k.status = 'verified' AND u.closed_at IS NULL ORDER BY k.decided_at DESC LIMIT 1`,
    hash,
  );
}

export function setKycDecision(id: string, status: KycStatus, by: string, at = Date.now(), reasons?: string[]) {
  ensureKycTables();
  if (reasons) run("UPDATE kyc_records SET status = ?, decided_by = ?, decided_at = ?, reasons = ? WHERE id = ?", status, by, at, JSON.stringify(reasons), id);
  else run("UPDATE kyc_records SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", status, by, at, id);
}

/** Fills in a reserved row once the provider has answered. False when a person decided it meanwhile. */
export function completeKycRecord(
  id: string,
  r: Pick<KycRecord, "id_last4" | "id_hash" | "name_on_doc" | "dob" | "status" | "file_path" | "decided_by" | "decided_at"> & { checks: KycCheck[]; reasons: string[] },
) {
  ensureKycTables();
  const res = run(
    `UPDATE kyc_records SET id_last4 = ?, id_hash = ?, name_on_doc = ?, dob = ?, status = ?, checks = ?, reasons = ?, file_path = ?, decided_by = ?, decided_at = ?
     WHERE id = ? AND status = 'pending' AND decided_at IS NULL`,
    r.id_last4,
    r.id_hash,
    r.name_on_doc,
    r.dob,
    r.status,
    JSON.stringify(r.checks),
    JSON.stringify(r.reasons),
    r.file_path,
    r.decided_by,
    r.decided_at,
    id,
  );
  return Number(res.changes) > 0;
}

/** Drops a reservation whose upload or provider call failed. */
export function deleteKycRecord(id: string) {
  ensureKycTables();
  run("DELETE FROM kyc_records WHERE id = ? AND status = 'pending'", id);
}

/** Deletes the ID photo of a rejected check; the row keeps last 4, checks and the decision. */
export function deleteKycPhoto(id: string) {
  const r = kycRecord(id);
  if (!r?.file_path) return;
  fs.rmSync(r.file_path, { force: true });
  run("UPDATE kyc_records SET file_path = NULL WHERE id = ?", id);
}
