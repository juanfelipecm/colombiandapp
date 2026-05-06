#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_SSH_KEY="$(cd "$REPO_DIR/.." && pwd)/termux_do_key"

DROPLET_HOST="${DROPLET_HOST:-root@134.122.12.116}"
SSH_KEY="${SSH_KEY:-$DEFAULT_SSH_KEY}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/root/.openclaw/workspace/colombiandapp}"
SERVICE_NAME="${SERVICE_NAME:-colombiandapp.service}"
HEALTH_URL="${HEALTH_URL:-https://colombiando.134.122.12.116.nip.io/api/telegram/webhook}"

cd "$REPO_DIR"

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name @{u})"
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "$upstream")"

if [[ "$local_head" != "$remote_head" ]]; then
  echo "Local HEAD is not pushed to $upstream."
  echo "Run: git push"
  exit 1
fi

ssh_args=(-o BatchMode=yes -o IdentitiesOnly=yes -i "$SSH_KEY" "$DROPLET_HOST")

ssh "${ssh_args[@]}" "set -euo pipefail
cd '$REMOTE_APP_DIR'
git pull --ff-only
npm run build
systemctl restart '$SERVICE_NAME'
sleep 2
systemctl is-active '$SERVICE_NAME'
git rev-parse --short HEAD
curl -fsS '$HEALTH_URL'
"
