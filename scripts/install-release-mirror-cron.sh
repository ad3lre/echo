#!/usr/bin/env bash
# Install a user crontab entry that mirrors release/1.0.0 to GitHub once per day at 23:00.
# See docs/operations/github-release-mirror.md.
#
# Usage:
#   npm run mirror:github-release:install-cron
#   npm run mirror:github-release:install-cron -- --yes
#
# Env:
#   ECHO_RELEASE_MIRROR_HOUR (23), ECHO_RELEASE_MIRROR_TZ (Europe/Berlin)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOUR="${ECHO_RELEASE_MIRROR_HOUR:-23}"
MINUTE="${ECHO_RELEASE_MIRROR_MINUTE:-0}"
TZ_NAME="${ECHO_RELEASE_MIRROR_TZ:-Europe/Berlin}"
LOG="${ECHO_RELEASE_MIRROR_LOG:-$HOME/.local/state/echo-release-mirror.log}"
MARKER="# echo-release-mirror-cron"
DO_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes | -y) DO_INSTALL=1; shift ;;
    -h | --help)
      grep '^#' "$0" | head -n 14 | cut -c3-
      exit 0
      ;;
    *)
      echo "install-release-mirror-cron: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$DO_INSTALL" -eq 0 && -z "${ECHO_RELEASE_MIRROR_CRON_CONFIRM:-}" ]]; then
  echo "install-release-mirror-cron: preview only. Re-run with --yes to install."
fi

mkdir -p "$(dirname "$LOG")"
CRON_LINE="${MINUTE} ${HOUR} * * * TZ=${TZ_NAME} cd ${ROOT} && bash scripts/mirror-release-to-github.sh >>${LOG} 2>&1 ${MARKER}"

echo "Daily GitHub mirror (GitLab release/1.0.0 -> github):"
echo "  When: ${HOUR}:$(printf '%02d' "$MINUTE") ${TZ_NAME} (server must be on and have git + remotes)"
echo "  Log:  ${LOG}"
echo ""
echo "Crontab line:"
echo "  ${CRON_LINE}"
echo ""

if [[ "$DO_INSTALL" -eq 0 && -z "${ECHO_RELEASE_MIRROR_CRON_CONFIRM:-}" ]]; then
  exit 0
fi

existing=$(crontab -l 2>/dev/null || true)
if printf '%s\n' "$existing" | grep -qF "$MARKER"; then
  filtered=$(printf '%s\n' "$existing" | grep -vF "$MARKER" | grep -v 'mirror-release-to-github.sh' || true)
else
  filtered="$existing"
fi

{ printf '%s\n' "$filtered" | sed '/^[[:space:]]*$/d'; echo "$CRON_LINE"; } | crontab -
echo "Installed. Verify with: crontab -l | grep echo-release-mirror"
