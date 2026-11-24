import crypto from "node:crypto";
import { all, get, run } from "./db";

export type ActorType = "user" | "system" | "model" | "reviewer";

export interface AuditRow {
  id: number;
  ts: number;
  user_id: string | null;
  actor: string;
  actor_type: ActorType;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  prev_hash: string;
  hash: string;
}

/** The `prev_hash` of the first row. */
export const GENESIS = "0".repeat(64); // audit-anchors: exported for the checker

function digest(prev: string, row: Omit<AuditRow, "id" | "hash" | "prev_hash">) {
  const canonical = JSON.stringify([row.ts, row.user_id, row.actor, row.actor_type, row.action, row.entity_type, row.entity_id, row.details]);
  return crypto.createHash("sha256").update(prev).update(canonical).digest("hex");
}

/**
 * Appends a tamper-evident record. Each row's hash covers the previous row's
 * hash, so editing any historical row breaks every hash after it.
 */
export function audit(entry: {
  userId?: string | null;
  actor: string;
  actorType: ActorType;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: unknown;
  ts?: number;
}) {
  const prev = get<{ hash: string }>("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")?.hash ?? GENESIS;
  const row = {
    ts: entry.ts ?? Date.now(),
    user_id: entry.userId ?? null,
    actor: entry.actor,
    actor_type: entry.actorType,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    details: entry.details === undefined ? null : JSON.stringify(entry.details),
  };
  const hash = digest(prev, row);
  run(
    `INSERT INTO audit_log (ts, user_id, actor, actor_type, action, entity_type, entity_id, details, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.ts,
    row.user_id,
    row.actor,
    row.actor_type,
    row.action,
    row.entity_type,
    row.entity_id,
    row.details,
    prev,
    hash,
  );
}

/**
 * Re-walks rows in id order and recomputes every hash. Pure (no database), so the offline checker
 * (`npm run audit:verify`, src/lib/audit-anchors) walks a read-only copy with exactly the same rule.
 */
export function walkAuditRows(rows: readonly AuditRow[]) {
  // audit-anchors
  let prev = GENESIS;
  for (const r of rows) {
    const expected = digest(prev, r);
    if (r.prev_hash !== prev || r.hash !== expected) {
      return { ok: false, checked: rows.length, brokenAt: r.id as number | null, headHash: rows.at(-1)?.hash ?? GENESIS };
    }
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null as number | null, headHash: prev };
}

export function verifyAuditChain() {
  return walkAuditRows(all<AuditRow>("SELECT * FROM audit_log ORDER BY id ASC"));
}

/**
 * The chain's head as it stands: the last row's id and hash, and how many rows there are (0, GENESIS and 0
 * when empty). This is what an anchor records (src/lib/audit-anchors). One query, so the three agree.
 */
export function auditHead(): { lastId: number; headHash: string; count: number } {
  // audit-anchors
  const last = get<{ id: number; hash: string; n: number }>(
    "SELECT id, hash, (SELECT COUNT(*) FROM audit_log) AS n FROM audit_log ORDER BY id DESC LIMIT 1",
  );
  return last ? { lastId: last.id, headHash: last.hash, count: last.n } : { lastId: 0, headHash: GENESIS, count: 0 };
}
