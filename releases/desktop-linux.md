# Linux desktop (Tauri)

## Artifacts (local build)

- `src-tauri/target/release/bundle/deb/`
- `src-tauri/target/release/bundle/appimage/`

## Build (repo root)

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

## CI

Linux on PR CI uses a faster compile-only path (`tauri:build:quick`); see [`.github/workflows/echo-desktop-ci.yml`](../.github/workflows/echo-desktop-ci.yml).

## Details

Distro prerequisites (WebKitGTK, etc.), Wayland notes, QA smoke list: [`docs/operations/desktop-linux.md`](../docs/operations/desktop-linux.md).
