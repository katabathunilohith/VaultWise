# Restoring Vaultwise from a backup

Two kinds of backup exist (see [README.md](README.md)):

| Backup | Made by | Kept | Use it when |
|---|---|---|---|
| Nightly copy in `/var/backups/vaultwise/<date>/` (`vaultwise.db` + `uploads.tar.gz` + `audit-anchors.jsonl`) | `/usr/local/sbin/vaultwise-backup` (the root-owned copy of `deploy/backup.sh`) from cron | 14 days | The data is wrong or lost but the server is fine |
| Lightsail automatic snapshot (the whole disk) | Lightsail | 7 days | The server itself is broken or gone |

Run every command below on the server, over SSH, unless it says otherwise.

> **Photo paths are stored in full** (`/var/lib/vaultwise/uploads/...`), so a real restore must go back into
> `/var/lib/vaultwise`. A test restore into a scratch folder checks the database and files, which is what you want
> for the monthly test.

## Test a restore (do this once after setup, then monthly)

This doesn't touch the live app.

1. Pick the newest backup:

   ```bash
   LATEST=$(sudo ls -1 /var/backups/vaultwise | tail -n 1); echo "$LATEST"
   ```

2. Copy it into a scratch folder and unpack the photos:

   ```bash
   sudo rm -rf /tmp/restore-test && sudo mkdir -p /tmp/restore-test
   sudo cp /var/backups/vaultwise/$LATEST/vaultwise.db /var/backups/vaultwise/$LATEST/audit-anchors.jsonl /tmp/restore-test/
   sudo tar -C /tmp/restore-test -xzf /var/backups/vaultwise/$LATEST/uploads.tar.gz
   ```

3. Check the database is whole and has your data. The first command must print `ok`:

   ```bash
   sudo sqlite3 /tmp/restore-test/vaultwise.db "PRAGMA integrity_check;"
   sudo sqlite3 /tmp/restore-test/vaultwise.db "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS proofs FROM proofs; SELECT COUNT(*) AS audit_rows FROM audit_log;"
   sudo ls /tmp/restore-test/uploads | head
   ```

   Compare the counts with the live database (`sudo sqlite3 /var/lib/vaultwise/vaultwise.db "SELECT COUNT(*) FROM users;"`):
   they should match, or be a little lower if people signed up since the backup.

   Then check the copy's audit log against the anchors saved with it, as the app user (never as root). It must end
   with `OK:`:

   ```bash
   sudo chown -R vaultwise:vaultwise /tmp/restore-test && sudo chmod 700 /tmp/restore-test
   sudo -u vaultwise -H bash -c 'cd /opt/vaultwise && npm run audit:verify -- --db /tmp/restore-test/vaultwise.db --anchors /tmp/restore-test/audit-anchors.jsonl'
   ```

4. Clean up (the copy holds personal data):

   ```bash
   sudo rm -rf /tmp/restore-test
   ```

Write the date and the counts in your project log, so you can show the restore was tested.

## Restore the live app from a nightly backup

1. Choose the backup (the newest one from before the problem):

   ```bash
   sudo ls -1 /var/backups/vaultwise
   B=/var/backups/vaultwise/2026-11-22T213000Z   # replace with the folder you chose
   ```

2. Stop the app, so nothing writes while you swap the files:

   ```bash
   sudo systemctl stop vaultwise
   ```

3. Keep the current data aside, just in case:

   ```bash
   sudo mv /var/lib/vaultwise /var/lib/vaultwise.before-restore-$(date +%F)
   sudo mkdir -p /var/lib/vaultwise
   ```

4. Put the backup in place:

   ```bash
   sudo cp $B/vaultwise.db /var/lib/vaultwise/vaultwise.db
   sudo cp $B/audit-anchors.jsonl /var/lib/vaultwise/audit-anchors.jsonl
   sudo tar -C /var/lib/vaultwise -xzf $B/uploads.tar.gz
   sudo chown -R vaultwise:vaultwise /var/lib/vaultwise
   sudo chmod 750 /var/lib/vaultwise
   ```

   Don't copy any old `vaultwise.db-wal` or `vaultwise.db-shm` files: the backup is already complete without them.
   The audit anchors come from the same backup as the database, so they match it. The anchors written since then
   name audit rows the restored database doesn't have, so keep that file as a record (it holds no personal data)
   instead of putting it back:

   ```bash
   sudo cp /var/lib/vaultwise.before-restore-$(date +%F)/audit-anchors.jsonl /var/backups/vaultwise/audit-anchors.before-restore-$(date +%F).jsonl
   ```

   (If you made the anchors file append-only with `chattr +a`, do the same to the restored one after step 5.)

5. Start the app and check it:

   ```bash
   sudo systemctl start vaultwise
   sudo systemctl status vaultwise --no-pager
   curl -fsS https://YOUR-DOMAIN/api/v1/region
   ```

   Then sign in on the website and open a vault with a bill photo, to check photos load. Check the audit log against
   its anchors (it must end with `OK:`; the app added a new anchor when it started):

   ```bash
   sudo -u vaultwise -H bash -c 'cd /opt/vaultwise && export VAULTWISE_DATA_DIR=/var/lib/vaultwise && set -a && . /etc/vaultwise.env && set +a && npm run audit:verify'
   ```

6. When you're sure everything works (give it a few days), delete the old copy, because it holds personal data:

   ```bash
   sudo chattr -a /var/lib/vaultwise.before-restore-*/audit-anchors.jsonl 2> /dev/null || true
   sudo rm -rf /var/lib/vaultwise.before-restore-*
   ```

Anything that happened after the backup was made (new sign-ups, vaults, bills) is lost. Tell your testers.

## Restore the whole server from a Lightsail snapshot

Use this if the server won't boot, was deleted, or you can't log in.

1. In the [Lightsail console](https://lightsail.aws.amazon.com/), open **Snapshots**, find the newest automatic snapshot
   of the instance, and choose **Create new instance**. Pick the same plan (2 GB) in Mumbai.
2. When it's running, open **Networking** on the new instance and **attach the static IP** (detach it from the old one
   first). Your domain keeps working because it points at the static IP.
3. Check the firewall rules on the new instance still allow HTTPS (443) and HTTP (80); add them if not.
4. SSH in and check: `sudo systemctl status vaultwise caddy --no-pager`, then open the site.
5. If the snapshot is older than last night's backup, restore the nightly backup too (above). Snapshots and nightly
   backups live on the same server unless you set up the S3 copy, so a lost server loses its nightly backups as well.
6. Delete the old instance once the new one works (it still costs money while it exists).
