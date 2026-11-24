import { GENESIS } from "../audit";

/** One line of the anchors file: the audit chain's head at `ts`. */
export interface AuditAnchor {
  ts: number;
  lastId: number;
  headHash: string;
  count: number;
}

const HEX64 = /^[0-9a-f]{64}$/;
const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Reads anchor lines. Accepts the file's JSON lines and also the stdout copy as the journal shows it
 * (anything before `audit_anchor ` is ignored), so `journalctl ... | grep audit_anchor` can be checked too.
 * A line that isn't a well-formed anchor is a problem, not skipped: the file is evidence.
 */
export function parseAnchors(text: string): { anchors: (AuditAnchor & { line: number })[]; problems: string[] } {
  const anchors: (AuditAnchor & { line: number })[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const marker = raw.indexOf("audit_anchor ");
    const body = (marker >= 0 ? raw.slice(marker + "audit_anchor ".length) : raw).trim();
    if (!body) return;
    let a: Partial<AuditAnchor>;
    try {
      a = JSON.parse(body);
    } catch {
      problems.push(`line ${line}: not JSON`);
      return;
    }
    if (!a || !isWhole(a.ts) || !isWhole(a.lastId) || !isWhole(a.count) || typeof a.headHash !== "string" || !HEX64.test(a.headHash)) {
      problems.push(`line ${line}: not an anchor ({ ts, lastId, headHash, count })`);
      return;
    }
    anchors.push({ ts: a.ts, lastId: a.lastId, headHash: a.headHash, count: a.count, line });
  });
  return { anchors, problems };
}

/**
 * Checks the chain's rows (id order) against every anchor: the anchored row must still exist with the same hash,
 * and there must be exactly as many rows up to it. A chain rebuilt from some point on (new hashes) or trimmed
 * fails here even when it is internally consistent. Anchors must also never go backwards. Pure.
 */
export function checkAnchors(rows: readonly { id: number; hash: string }[], anchors: readonly (AuditAnchor & { line?: number })[]): string[] {
  const problems: string[] = [];
  const hashById = new Map(rows.map((r) => [r.id, r.hash]));
  const ids = rows.map((r) => r.id);
  const lastRow = ids.at(-1) ?? 0;
  /** How many rows have id <= `id` (ids ascend). */
  const countUpTo = (id: number) => {
    let lo = 0;
    let hi = ids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ids[mid] <= id) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let previous: AuditAnchor | null = null;
  for (const a of anchors) {
    const where = `${a.line ? `line ${a.line}, ` : ""}anchor of ${new Date(a.ts).toISOString()}`;
    if (previous && (a.lastId < previous.lastId || a.count < previous.count)) {
      problems.push(`${where}: goes backwards (row ${a.lastId}, ${a.count} rows; the one before had row ${previous.lastId}, ${previous.count} rows)`);
    }
    previous = a;
    if (a.count === 0) {
      if (a.lastId !== 0 || a.headHash !== GENESIS) problems.push(`${where}: says the chain was empty but names row ${a.lastId}`);
      continue;
    }
    const hash = hashById.get(a.lastId);
    if (hash === undefined) {
      problems.push(`${where}: row ${a.lastId} is missing (the database ends at row ${lastRow})`);
      continue;
    }
    if (hash !== a.headHash) problems.push(`${where}: row ${a.lastId} has hash ${hash.slice(0, 12)}…, the anchor says ${a.headHash.slice(0, 12)}…`);
    const n = countUpTo(a.lastId);
    if (n !== a.count) problems.push(`${where}: ${n} rows up to row ${a.lastId}, the anchor says ${a.count}`);
  }
  return problems;
}
