# Audit anchors (server)

Copies of the audit chain's head kept outside the database (security review gap 15). The audit log
(`src/lib/audit.ts`) is hash-chained, so editing a row breaks every hash after it, but someone who can rewrite the
database could recompute the whole chain. An anchor is an earlier, out-of-database record of the head, so a
rebuilt chain no longer matches it.

## Setting

| Variable | Effect |
|---|---|
| `AUDIT_ANCHOR_FILE` | Where anchors are appended. Default `<VAULTWISE_DATA_DIR>/audit-anchors.jsonl` (`/var/lib/vaultwise/audit-anchors.jsonl` on the server, which is inside the service's `ReadWritePaths`; another path must be added there). |

Always on; there is no switch.

## How it works

- **An anchor** is one JSON line, `{ "ts": <ms>, "lastId": <newest audit row id>, "headHash": <its hash>, "count": <rows> }`
  (`lastId` 0, `headHash` 64 zeros and `count` 0 while the log is empty), appended to the file and printed to stdout
  as `[vaultwise] audit_anchor {...}`, so systemd's journal keeps a second copy. The nightly backup keeps a third
  (and S3 a fourth, when set up).
- **When**: once at every server start (`src/instrumentation.ts`), and once a day from the lazy scheduler
  (`tick()` in `src/lib/scheduler.ts`: due when the newest anchor is 24 hours old or there is none). Neither ever
  throws: a failure is logged as `[vaultwise] audit_anchor_failed` and the request or start-up goes on.
- **Checking**: `npm run audit:verify` (`scripts/audit-verify.mjs` → `cli.ts`) opens the database read-only (no
  migrations), walks every hash again with the same rule as the server (`walkAuditRows()` in `src/lib/audit.ts`),
  then checks every anchor: the anchored row must still exist with the same hash, there must be exactly `count` rows
  up to it, and anchors must never go backwards. Any problem, an unreadable line, a missing file or a file with no
  anchors exits 1; exit 2 means it couldn't run (bad option, no database). Options: `--db <file>` and
  `--anchors <file>` check another copy (a backup, or the journal's lines: anything before `audit_anchor ` on a line
  is ignored). It needs Node 22.18 or later (type stripping); the server runs 24.
- **After a restore** the database is older than the newest anchors, so the restore puts back the anchors file from
  the same backup (the backup copies the anchors before the database, so every anchor in it is covered). See
  `deploy/restore.md`.

What it doesn't do: it doesn't stop someone with root on the server from editing every copy on that server. The
journal and S3 copies, and a check run on another machine against a downloaded backup, are what make that hard.

## Files

| File | What |
|---|---|
| `config.ts` | `anchorFile()`, `ANCHOR_EVERY_MS`, `LOG_MARKER` |
| `check.ts` | `parseAnchors(text)`, `checkAnchors(rows, anchors)` (pure) |
| `anchor.ts` | `anchorAuditChain()`, `anchorAuditIfDue()`, `anchorAuditOnStartup()`, `lastAnchorAt()` |
| `cli.ts` | `auditVerify(argv, out)`: the checker behind `npm run audit:verify` |
| `index.ts` | the module's public surface (the checker is imported directly by its script) |

## Touch points outside this folder (marked `// audit-anchors`)

| File | What |
|---|---|
| `src/lib/audit.ts` | `walkAuditRows()` (pure walk, shared with the checker), `auditHead()`, `GENESIS` exported |
| `src/lib/scheduler.ts` | `anchorAuditIfDue(now)` in `tick()` |
| `src/instrumentation.ts`, `src/instrumentation-node.ts` | one anchor per start |
| `scripts/audit-verify.mjs`, `package.json` (`audit:verify`) | the checker's entry point |
| `deploy/backup.sh` | copies the anchors before the database, checks the newest anchor against the copy |
| `deploy/README.md` (step 17), `deploy/restore.md` | running the checker as the app user; restoring the matching anchors |
| `tests/audit-anchors.test.ts` | tests |

## Remove it

1. Delete this folder and `scripts/audit-verify.mjs`, and the `audit:verify` script in `package.json`.
2. Remove the marked lines in `src/lib/scheduler.ts` and the two instrumentation files.
3. Remove the anchor steps from `deploy/backup.sh` and the docs. The anchors file can be deleted (it holds no
   personal data).
