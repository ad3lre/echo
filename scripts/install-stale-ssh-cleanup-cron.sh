#!/usr/bin/env bash
# Install cron to clean stale SSH sessions and ssh-agent processes.
# Runs every 30 minutes so ssh-agent count/RSS caps can trigger without waiting 48h.
#
# Usage:
#   npm run ssh-cleanup:install-cron
#   npm run ssh-cleanup:install-cron -- --yes
#
# Env:
#   ECHO_SSH_CLEANUP_CRON (*/30 * * * *), ECHO_SSH_CLEANUP_TZ (Europe/Berlin)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_SCHEDULE="${ECHO_SSH_CLEANUP_CRON:-*/30 * * * *}"
TZ_NAME="${ECHO_SSH_CLEANUP_TZ:-Europe/Berlin}"
LOG="${ECHO_SSH_CLEANUP_LOG:-$HOME/.local/state/echo-ssh-cleanup.log}"
MARKER="# echo-ssh-cleanup-cron"
DO_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes | -y) DO_INSTALL=1; shift ;;
    -h | --help)
      grep '^#' "$0" | head -n 14 | cut -c3-
      exit 0
      ;;
    *)
      echo "install-stale-ssh-cleanup-cron: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$DO_INSTALL" -eq 0 && -z "${ECHO_SSH_CLEANUP_CRON_CONFIRM:-}" ]]; then
  echo "install-stale-ssh-cleanup-cron: preview only. Re-run with --yes to install."
fi

mkdir -p "$(dirname "$LOG")"
chmod +x "$ROOT/scripts/cleanup-stale-ssh.sh"
CRON_LINE="${CRON_SCHEDULE} TZ=${TZ_NAME} bash ${ROOT}/scripts/cleanup-stale-ssh.sh >>${LOG} 2>&1 ${MARKER}"

echo "Stale SSH / ssh-agent cleanup:"
echo "  Schedule: ${CRON_SCHEDULE} (${TZ_NAME})"
echo "  Max age: ${ECHO_SSH_CLEANUP_MAX_AGE_HOURS:-48} hours"
echo "  ssh-agent hard cap: ${ECHO_SSH_AGENT_MAX_COUNT:-3500} processes (emergency prune, oldest first)"
echo "  ssh-agent hard cap: ${ECHO_SSH_AGENT_MAX_RSS_GB:-15} GB total RSS (emergency prune, oldest first)"
echo "  Log:  ${LOG}"
echo ""
echo "Crontab line:"
echo "  ${CRON_LINE}"
echo ""

if [[ "$DO_INSTALL" -eq 0 && -z "${ECHO_SSH_CLEANUP_CRON_CONFIRM:-}" ]]; then
  exit 0
fi

existing=$(crontab -l 2>/dev/null || true)
if printf '%s\n' "$existing" | grep -qF "$MARKER"; then
  filtered=$(printf '%s\n' "$existing" | grep -vF "$MARKER" | grep -v 'cleanup-stale-ssh.sh' || true)
else
  filtered="$existing"
fi

{ printf '%s\n' "$filtered" | sed '/^[[:space:]]*$/d'; echo "$CRON_LINE"; } | crontab -
echo "Installed. Verify with: crontab -l | grep echo-ssh-cleanup"
