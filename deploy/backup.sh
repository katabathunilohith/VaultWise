#!/usr/bin/env bash
# Nightly backup of the Vaultwise database and uploaded photos (plan 05).
#
# Makes a consistent copy of the SQLite database with sqlite3's online ".backup" (safe while the app is
# running), checks it, packs data/uploads next to it, and deletes backups older than KEEP_DAYS.
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
set -euo pipefail

DATA_DIR="${VAULTWISE_DATA_DIR:-/var/lib/vaultwise}"
BACKUP_ROOT="${BACKUP_DIR:-/var/backups/vaultwise}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB="$DATA_DIR/vaultwise.db"
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

# 1. The database. ".timeout" waits up to 10 s if the app is mid-write.
sqlite3 -cmd ".timeout 10000" "$DB" ".backup '$DEST/vaultwise.db'"
check="$(sqlite3 "$DEST/vaultwise.db" "PRAGMA integrity_check;")"
if [ "$check" != "ok" ]; then
  echo "$(date -u +%FT%TZ) The backup failed its integrity check: $check" >&2
  exit 1
fi

# 2. Uploaded bill and ID photos.
if [ -d "$DATA_DIR/uploads" ]; then
  tar -C "$DATA_DIR" -czf "$DEST/uploads.tar.gz" uploads
fi

# 3. Optional: a second copy off this server, in a private S3 bucket in ap-south-1 (see deploy/README.md).
#    Give the bucket a lifecycle rule that deletes objects after 14 days, so it keeps the same window.
if [ -n "${BACKUP_S3_URI:-}" ]; then
  AWS_BIN="$(command -v aws || echo /snap/bin/aws)"
  "$AWS_BIN" s3 cp --recursive "$DEST" "${BACKUP_S3_URI%/}/$STAMP/" --sse AES256 --only-show-errors
fi

# 4. Delete backups older than KEEP_DAYS (age is counted in whole days, so this keeps the last KEEP_DAYS nights).
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$((KEEP_DAYS - 1))" -exec rm -rf {} +

size="$(du -sh "$DEST" | cut -f1)"
echo "$(date -u +%FT%TZ) Backup OK: $DEST ($size)"
