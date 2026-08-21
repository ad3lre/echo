#!/usr/bin/env bash
# Scroll-feel verification: layout correctness + scroll metrics report.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${LAYOUT_VERIFY_OUT:-/tmp/echo-scroll-verify.json}"
FRONTEND_PORT="${LAYOUT_VERIFY_FRONTEND_PORT:-8085}"
HARNESS_PORT="${LAYOUT_VERIFY_PORT:-3003}"
FIXTURE="${SCROLL_FIXTURE:-geometry}"
MODALITY="${SCROLL_MODALITY:-wheel}"
HARNESS_PID=""
VITE_PID=""

cleanup() {
  if [[ -n "${VITE_PID}" ]]; then kill "${VITE_PID}" 2>/dev/null || true; fi
  if [[ -n "${HARNESS_PID}" ]]; then kill "${HARNESS_PID}" 2>/dev/null || true; fi
}
trap cleanup EXIT

fuser -k "${HARNESS_PORT}/tcp" 2>/dev/null || true
sleep 1
rm -f "${OUT}"

cd "${ROOT}/server/backend"
PORT="${HARNESS_PORT}" LAYOUT_VERIFY_OUT="${OUT}" SCROLL_FIXTURE="${FIXTURE}" \
  node --import tsx src/tests/helpers/messageListLayoutHarness.ts > /tmp/echo-scroll-harness.log 2>&1 &
HARNESS_PID=$!

for _ in $(seq 1 60); do
  if [[ -f "${OUT}" ]]; then break; fi
  sleep 1
done
if [[ ! -f "${OUT}" ]]; then
  echo "Harness failed. Log:" >&2
  tail -30 /tmp/echo-scroll-harness.log >&2 || true
  exit 1
fi

BACKEND_URL="$(node -e "console.log(JSON.parse(require('fs').readFileSync('${OUT}','utf8')).backendUrl)")"
cd "${ROOT}/clients/web"
VITE_API_URL= env VITE_API_URL= npx vite --port "${FRONTEND_PORT}" --strictPort > /tmp/echo-scroll-vite.log 2>&1 &
VITE_PID=$!

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1; then break; fi
  sleep 1
done

LAYOUT_VERIFY_ENV="${OUT}" \
BACKEND_URL="${BACKEND_URL}" \
FRONTEND_URL="http://localhost:${FRONTEND_PORT}" \
SCROLL_FIXTURE="${FIXTURE}" \
SCROLL_MODALITY="${MODALITY}" \
LAYOUT_VERIFY_SEED=register \
node "${ROOT}/clients/web/scripts/verify-message-list-layout.mjs"
