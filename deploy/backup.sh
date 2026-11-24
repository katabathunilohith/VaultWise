#!/usr/bin/env bash
# Nightly backup of the Vaultwise database, uploaded photos and audit anchors (plan 05).
#
# Copies the audit anchors file (src/lib/audit-anchors), then makes a consistent copy of the SQLite database with
# sqlite3's online ".backup" (safe while the app is running), checks it, checks the newest anchor against it, packs
# data/uploads next to it, and deletes backups older than KEEP_DAYS. It never runs app code (that's
# `npm run audit:verify`, run as the app user: deploy/README.md, step 17).
# Root runs it from cron, as a root-owned copy outside the app folder (see deploy/README.md, step 17):
#   sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/backup.sh /usr/local/sbin/vaultwise-backup
#   30 21 * * * root /usr/local/sbin/vaultwise-backup >> /var/log/vaultwise-backup.log 2>&1
# Never point cron at /opt/vaultwise/deploy/backup.sh: the app user "vaultwise" can write there, so root would
# run whatever it put in the file. Install a new copy only after reading what changed (vaultwise-update shows it).
#
# Settings (environment variables, all optional; set them as lines in /etc/cron.d/vaultwise-backup):
#   VAULTWISE_DATA_DIR  where the app keeps vaultwise.db and uploads/   (default /var/lib/vaultwise)
#   BACKUP_DIR          where backups go, one folder per run            (default /var/backups/vaultwise)
#   KEEP_DAYS           how many days of backups to keep                (default 14)
#   BACKUP_S3_URI       a private S3 bucket for a second copy, e.g. s3://my-bucket/vaultwise (default: none)
#   AUDIT_ANCHOR_FILE   the app's audit anchors file, if /etc/vaultwise.env moved it (default $VAULTWISE_DATA_DIR/audit-anchors.jsonl)
set -euo pipefail

DATA_DIR="${VAULTWISE_DATA_DIR:-/var/lib/vaultwise}"
BACKUP_ROOT="${BACKUP_DIR:-/var/backups/vaultwise}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB="$DATA_DIR/vaultwise.db"
ANCHORS="${AUDIT_ANCHOR_FILE:-$DATA_DIR/audit-anchors.jsonl}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP"

if [ ! -f "$DB" ]; then
  echo "$(date -u +%FT%TZ) No database at $DB. Is VAULTWISE_DATA_DIR right?" >&2
  exit 1
fi
case "$BACKUP_ROOT" in
  "" | "/") echo "BACKUP_DIR must be a dedicated folder, not '$BACKUP_ROOT'." >&2; exit 1 ;;
esac

# Backups hold personal data: only root can read them.
umask 077
mkdir -p "$DEST"

# 1. The audit anchors, copied BEFORE the database: every anchor in this copy then names a row the database copy
#    below also has, so the pair checks out after a restore.
if [ -f "$ANCHORS" ]; then
  cp "$ANCHORS" "$DEST/audit-anchors.jsonl"
else
  echo "$(date -u +%FT%TZ) No audit anchors at $ANCHORS (the app writes them at start-up and daily). Backing up without them." >&2
fi

# 2. The database. ".timeout" waits up to 10 s if the app is mid-write.
sqlite3 -cmd ".timeout 10000" "$DB" ".backup '$DEST/vaultwise.db'"
check="$(sqlite3 "$DEST/vaultwise.db" "PRAGMA integrity_check;")"
if [ "$check" != "ok" ]; then
  echo "$(date -u +%FT%TZ) The backup failed its integrity check: $check" >&2
  exit 1
fi

# 3. The newest anchor must match the database copy: the same hash at the anchored row. (The full check of every
#    anchor and every hash is `npm run audit:verify`.) The anchors file is writable by the app user, so its values are
#    accepted only as plain digits and a 64-character hex hash before they go near sqlite3.
anchor_problem=""
if [ -s "$DEST/audit-anchors.jsonl" ]; then
  last="$(grep -v '^[[:space:]]*$' "$DEST/audit-anchors.jsonl" | tail -n 1 || true)"
  last_id="$(printf '%s\n' "$last" | sed -n 's/.*"lastId":\([0-9][0-9]*\).*/\1/p')"
  last_hash="$(printf '%s\n' "$last" | sed -n 's/.*"headHash":"\([0-9a-f]\{64\}\)".*/\1/p')"
  if [ -z "$last_id" ] || [ -z "$last_hash" ]; then
    anchor_problem="the newest line of $ANCHORS isn't an anchor"
  elif [ "$last_id" != "0" ]; then
    db_hash="$(sqlite3 "$DEST/vaultwise.db" "SELECT hash FROM audit_log WHERE id = $last_id;" || true)"
    if [ "$db_hash" != "$last_hash" ]; then
      anchor_problem="audit row $last_id doesn't match the newest anchor: the audit log may have been changed. Run npm run audit:verify (deploy/README.md, step 17)"
    fi
  fi
  if [ -n "$anchor_problem" ]; then echo "$(date -u +%FT%TZ) AUDIT ANCHOR MISMATCH: $anchor_problem" >&2; fi
fi

# 4. Uploaded bill and ID photos.
if [ -d "$DATA_DIR/uploads" ]; then
  tar -C "$DATA_DIR" -czf "$DEST/uploads.tar.gz" uploads
fi

# 5. Optional: a second copy off this server (database, photos and anchors), in a private S3 bucket in ap-south-1
#    (see deploy/README.md). Give the bucket a lifecycle rule that deletes objects after 14 days, so it keeps the same window.
if [ -n "${BACKUP_S3_URI:-}" ]; then
  AWS_BIN="$(command -v aws || echo /snap/bin/aws)"
  "$AWS_BIN" s3 cp --recursive "$DEST" "${BACKUP_S3_URI%/}/$STAMP/" --sse AES256 --only-show-errors
fi

# 6. Delete backups older than KEEP_DAYS (age is counted in whole days, so this keeps the last KEEP_DAYS nights).
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$((KEEP_DAYS - 1))" -exec rm -rf {} +

size="$(du -sh "$DEST" | cut -f1)"
echo "$(date -u +%FT%TZ) Backup OK: $DEST ($size)"
# The backup is kept either way, but an anchor mismatch makes the run fail, so the cron log shows it.
if [ -n "$anchor_problem" ]; then
  echo "$(date -u +%FT%TZ) ... but the audit anchor check failed (see AUDIT ANCHOR MISMATCH above)." >&2
  exit 1
fi
