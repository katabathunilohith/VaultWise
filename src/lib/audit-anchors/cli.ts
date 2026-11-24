import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { walkAuditRows, type AuditRow } from "../audit";
import { DATA_DIR } from "../db";
import { anchorFile } from "./config";
import { checkAnchors, parseAnchors } from "./check";

/**
 * `npm run audit:verify [-- --db <file>] [-- --anchors <file>]`: re-walks the audit chain from the database
 * (opened read-only, never migrated) and checks it against every anchor. Exit codes: 0 every check passed,
 * 1 a mismatch (or nothing to check against), 2 the command couldn't run (bad option, no database).
 * `out` collects the report lines, so tests can run it in-process.
 */
export function auditVerify(argv: readonly string[], out: (line: string) => void = console.log): number {
  const opts: { db?: string; anchors?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--db" || a === "--anchors") && argv[i + 1]) opts[a === "--db" ? "db" : "anchors"] = argv[++i];
    else {
      out(`Unknown option ${a}. Usage: npm run audit:verify -- [--db <vaultwise.db>] [--anchors <audit-anchors.jsonl>]`);
      return 2;
    }
  }
  const dbPath = path.resolve(opts.db ?? path.join(DATA_DIR, "vaultwise.db"));
  const anchorsPath = path.resolve(opts.anchors ?? anchorFile());
  if (!fs.existsSync(dbPath)) {
    out(`No database at ${dbPath}. Set VAULTWISE_DATA_DIR or pass --db.`);
    return 2;
  }

  const d = new DatabaseSync(dbPath, { readOnly: true });
  let rows: AuditRow[];
  try {
    const hasTable = d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'").get();
    rows = hasTable ? (d.prepare("SELECT * FROM audit_log ORDER BY id ASC").all() as unknown as AuditRow[]) : [];
  } finally {
    d.close();
  }

  const problems: string[] = [];
  const walk = walkAuditRows(rows);
  out(`Audit chain in ${dbPath}: ${walk.checked} rows, head ${walk.headHash.slice(0, 16)}…`);
  if (!walk.ok) problems.push(`the chain is broken at row ${walk.brokenAt}: its hash doesn't follow from the rows before it`);

  let text = "";
  try {
    text = fs.readFileSync(anchorsPath, "utf8");
  } catch {
    problems.push(`no anchors file at ${anchorsPath} (the server writes one on start and daily; pass --anchors to check another copy)`);
  }
  const parsed = parseAnchors(text);
  problems.push(...parsed.problems);
  if (text && parsed.anchors.length === 0 && parsed.problems.length === 0)
    problems.push(`${anchorsPath} has no anchors, so there is nothing to check against`);
  problems.push(...checkAnchors(rows, parsed.anchors));
  out(`Anchors in ${anchorsPath}: ${parsed.anchors.length}`);

  for (const p of problems) out(`MISMATCH: ${p}`);
  out(
    problems.length ? `FAILED: ${problems.length} problem${problems.length === 1 ? "" : "s"}.` : "OK: the chain is intact and matches every anchor.",
  );
  return problems.length ? 1 : 0;
}
