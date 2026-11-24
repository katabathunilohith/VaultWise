/**
 * Audit anchors (security review gap 15): copies of the audit chain's head kept outside the database, so a chain
 * rebuilt by someone with database access no longer matches. See README.md for the setting, the schedule, the
 * checker (`npm run audit:verify`) and every touch point outside this folder (marked `// audit-anchors`).
 */
export { anchorFile, ANCHOR_EVERY_MS, LOG_MARKER } from "./config";
export { parseAnchors, checkAnchors, type AuditAnchor } from "./check";
export { anchorAuditChain, anchorAuditIfDue, anchorAuditOnStartup, lastAnchorAt } from "./anchor";
