#!/usr/bin/env bash
# Self-contained image-slot fill verification (isolated test API + Playwright).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${IMAGE_SLOT_VERIFY_OUT:-/tmp/echo-image-slot-verify.json}"
FRONTEND_PORT="${IMAGE_SLOT_VERIFY_FRONTEND_PORT:-8086}"
HARNESS_PORT="${IMAGE_SLOT_VERIFY_PORT:-3002}"
HARNESS_PID=""
VITE_PID=""

cleanup() {
  if [[ -n "${VITE_PID}" ]]; then kill "${VITE_PID}" 2>/dev/null || true; fi
  if [[ -n "${HARNESS_PID}" ]]; then kill "${HARNESS_PID}" 2>/dev/null || true; fi
  rm -f "${OUT}"
}
trap cleanup EXIT

rm -f "${OUT}"

cd "${ROOT}/server/backend"
CORS_ORIGIN="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT},http://127.0.0.1:${HARNESS_PORT}" \
ECHO_APP_PUBLIC_URL="http://localhost:${FRONTEND_PORT}" \
ECHO_MARKETING_PUBLIC_URL="http://localhost:${FRONTEND_PORT}" \
ECHO_API_PUBLIC_URL="http://127.0.0.1:${HARNESS_PORT}" \
PORT="${HARNESS_PORT}" IMAGE_SLOT_VERIFY_OUT="${OUT}" \
  bun src/tests/helpers/imageSlotFillHarness.ts > /tmp/echo-image-slot-harness.log 2>&1 &
HARNESS_PID=$!

for _ in $(seq 1 60); do
  if [[ -f "${OUT}" ]]; then break; fi
  sleep 1
done
if [[ ! -f "${OUT}" ]]; then
  echo "Harness failed to start. Log:" >&2
  tail -30 /tmp/echo-image-slot-harness.log >&2 || true
  exit 1
fi

BACKEND_URL="$(bun -e "console.log(JSON.parse(require('fs').readFileSync('${OUT}','utf8')).backendUrl)")"
cd "${ROOT}/clients/web"
ECHO_DEV_BACKEND_URL="${BACKEND_URL}" VITE_SOCKET_IO_URL="http://localhost:${HARNESS_PORT}" VITE_API_URL= node "${ROOT}/node_modules/vite/bin/vite.js" --port "${FRONTEND_PORT}" --strictPort > /tmp/echo-image-slot-vite.log 2>&1 &
VITE_PID=$!

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1; then break; fi
  sleep 1
done

IMAGE_SLOT_VERIFY_ENV="${OUT}" \
BACKEND_URL="${BACKEND_URL}" \
FRONTEND_URL="http://localhost:${FRONTEND_PORT}" \
node "${ROOT}/clients/web/scripts/verify-image-slot-fill.mjs"
