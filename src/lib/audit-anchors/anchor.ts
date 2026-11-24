import fs from "node:fs";
import path from "node:path";
import { auditHead } from "../audit";
import { ANCHOR_EVERY_MS, anchorFile, LOG_MARKER } from "./config";
import { parseAnchors, type AuditAnchor } from "./check";

declare global {
  /** When the last anchor was written, per anchors file (survives hot reload). */
  var __vaultwiseAnchorAt: Record<string, number> | undefined;
}

/**
 * Writes the audit chain's current head, `{ ts, lastId, headHash, count }`, as one JSON line appended to the
 * anchors file (outside the database), and the same line to stdout so systemd's journal keeps a second copy.
 * Someone who can rewrite the database can rebuild a self-consistent chain, but not these earlier copies of its
 * head: `npm run audit:verify` compares them. Throws if the file can't be written.
 */
export function anchorAuditChain(opts: { now?: number } = {}): AuditAnchor {
  const anchor: AuditAnchor = { ts: opts.now ?? Date.now(), ...auditHead() };
  const file = anchorFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Opened for appending only; the mode applies when the file is first made.
  fs.appendFileSync(file, `${JSON.stringify(anchor)}\n`, { mode: 0o640, flag: "a" });
  console.log(`${LOG_MARKER}${JSON.stringify(anchor)}`);
  (globalThis.__vaultwiseAnchorAt ??= {})[file] = anchor.ts;
  return anchor;
}

/** When the newest anchor in the file was written, or null when there is none yet. */
export function lastAnchorAt(): number | null {
  const file = anchorFile();
  const known = globalThis.__vaultwiseAnchorAt?.[file];
  if (known !== undefined) return known;
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const last = parseAnchors(text).anchors.at(-1);
  if (!last) return null;
  (globalThis.__vaultwiseAnchorAt ??= {})[file] = last.ts;
  return last.ts;
}

/**
 * The scheduler's daily anchor (called from tick() in lib/scheduler.ts): writes one when the last is 24 hours
 * old or there is none. Never throws, so a full disk can't break a customer's request; the failure is logged.
 */
export function anchorAuditIfDue(now = Date.now()): AuditAnchor | null {
  try {
    const last = lastAnchorAt();
    if (last !== null && now - last < ANCHOR_EVERY_MS) return null;
    return anchorAuditChain({ now });
  } catch (e) {
    console.error("[vaultwise] audit_anchor_failed", e);
    return null;
  }
}

/** One anchor when the server starts (src/instrumentation.ts). Never throws: the server still starts, and says why not. */
export function anchorAuditOnStartup(): AuditAnchor | null {
  try {
    return anchorAuditChain();
  } catch (e) {
    console.error("[vaultwise] audit_anchor_failed at start-up", e);
    return null;
  }
}
