import path from "node:path";
import { DATA_DIR } from "../db";

/**
 * Where anchors go: AUDIT_ANCHOR_FILE, else `<VAULTWISE_DATA_DIR>/audit-anchors.jsonl`. Read on every call, so a
 * test (or a restart with new env) can change it. On the server the file must be inside the service's
 * ReadWritePaths (/var/lib/vaultwise, the default, is).
 */
export function anchorFile(): string {
  const configured = process.env.AUDIT_ANCHOR_FILE?.trim();
  return configured ? path.resolve(configured) : path.join(DATA_DIR, "audit-anchors.jsonl");
}

/** How often the scheduler writes an anchor (plus one on every server start). */
export const ANCHOR_EVERY_MS = 24 * 3_600_000;

/** The prefix of the stdout copy, so the journal's copy can be found and checked: `journalctl -u vaultwise -o cat | grep audit_anchor`. */
export const LOG_MARKER = "[vaultwise] audit_anchor ";
