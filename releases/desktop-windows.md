# Windows desktop (Tauri)

## Artifacts (local build)

After a production build, installers usually appear under:

- `src-tauri/target/release/bundle/nsis/` — NSIS `.exe`
- `src-tauri/target/release/bundle/msi/` — MSI

## Build (repo root)

Set your public API origins, then:

```powershell
$env:VITE_API_URL="https://chat-echo.com"
$env:VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

Quick compile-only check: `npm run tauri:build:quick` (see full docs).

## CI and published installers

- PR/branch builds: [`.github/workflows/echo-desktop-ci.yml`](../.github/workflows/echo-desktop-ci.yml) — Windows job uploads NSIS + MSI as workflow **Artifacts** (retention as configured in the workflow).
- Tags / manual Windows release: [`.github/workflows/echo-desktop-release-windows.yml`](../.github/workflows/echo-desktop-release-windows.yml) — runs on `workflow_dispatch` or push of tag `v*`; creates a **draft** GitHub Release with the same installers.

## Details

Signing, updater env vars, WebView/CORS, and troubleshooting: [`docs/operations/desktop-windows.md`](../docs/operations/desktop-windows.md).
