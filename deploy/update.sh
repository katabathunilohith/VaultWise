#!/usr/bin/env bash
# Builds and (re)starts Vaultwise on the server. Installed as a root-owned copy (deploy/README.md, step 12):
#   sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/update.sh /usr/local/sbin/vaultwise-update
# and run as root after the first setup and for every update:
#   sudo vaultwise-update            # pull the latest code, build, restart
#   sudo vaultwise-update --no-pull  # build and restart what's already there
#
# Root never runs anything from /opt/vaultwise: that folder belongs to the app user "vaultwise", and `npm ci`
# runs package install scripts as that user, so a file there could have been changed by any package. The pull,
# the install and the build run as "vaultwise"; root only restarts the service. When the repository has a newer
# copy of this script, backup.sh or the service file, it shows the difference (control characters made
# visible) and tells you the command to install it, after you have read it. It never installs them itself.
#
# The build reads /etc/vaultwise.env, because NEXT_PUBLIC_* values are baked into the web pages at build time.
# --include=dev: the env file sets NODE_ENV=production, which would otherwise skip the build tools.
set -euo pipefail

APP_DIR=/opt/vaultwise
ENV_FILE=/etc/vaultwise.env
APP_USER=vaultwise

if [ "$(id -u)" -ne 0 ]; then echo "Run this with sudo." >&2; exit 1; fi
if [ ! -r "$ENV_FILE" ]; then echo "Missing $ENV_FILE (deploy/README.md, step 11)." >&2; exit 1; fi

as_app() { sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $1"; }

# Compares a root-owned installed file with the repository's copy and explains how to update it.
check_installed() {
  local repo="$APP_DIR/deploy/$1" installed="$2" install_cmd="$3"
  if [ ! -f "$repo" ]; then return 0; fi
  if [ ! -f "$installed" ]; then
    echo "!! $installed is not installed yet. After reading $repo, install it with:"
    echo "     $install_cmd"
    return 0
  fi
  if ! cmp -s "$installed" "$repo"; then
    echo "!! The repository has a different deploy/$1 from the installed $installed:"
    diff -u "$installed" "$repo" | cat -v || true
    echo "!! Read the difference above. If you expect it, install the new copy with:"
    echo "     $install_cmd"
    echo "!! (This run keeps using the installed copy.)"
  fi
}

if [ "${1:-}" != "--no-pull" ]; then
  echo "== Pulling the latest code"
  as_app "git pull --ff-only"
fi

echo "== Checking the root-owned copies of the deploy files"
check_installed update.sh /usr/local/sbin/vaultwise-update \
  "sudo install -o root -g root -m 0755 $APP_DIR/deploy/update.sh /usr/local/sbin/vaultwise-update"
check_installed backup.sh /usr/local/sbin/vaultwise-backup \
  "sudo install -o root -g root -m 0755 $APP_DIR/deploy/backup.sh /usr/local/sbin/vaultwise-backup"
check_installed vaultwise.service /etc/systemd/system/vaultwise.service \
  "sudo install -o root -g root -m 0644 $APP_DIR/deploy/vaultwise.service /etc/systemd/system/vaultwise.service && sudo systemctl daemon-reload"

echo "== Installing packages and building (a few minutes)"
as_app "set -a && . '$ENV_FILE' && set +a && npm ci --include=dev --no-audit --no-fund && npm run build"

echo "== Restarting"
systemctl restart vaultwise
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/api/v1/region; then
    echo "== Vaultwise is up"
    exit 0
  fi
  sleep 1
done
echo "Vaultwise didn't answer within 30 seconds. See: journalctl -u vaultwise -n 50 --no-pager" >&2
exit 1
