# iOS (Tauri)

Bundle id (current): `com.echo.tauri.ios.dev` (see `src-tauri/tauri.ios.conf.json`) — distinct from Android `com.echo.app` and desktop `com.echo.desktop`.

## Artifacts (local build)

Release archive / IPA paths vary by signing profile; unsigned CI output:

- `src-tauri/gen/apple/build/**/Echo.ipa` (after `npm run tauri:ios:build:unsigned`)

Generate or refresh `src-tauri/gen/apple` when needed: `npm run tauri:ios:init`.

## Build (repo root, macOS + Xcode)

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:ios:build
```

Preset for production Echo host: `npm run tauri:ios:build:chat-echo`. Simulator dev: `npm run tauri:ios:dev`. Version alignment: `npm run verify:ios-version`.

## CI

[`.github/workflows/echo-ios-ci.yml`](../.github/workflows/echo-ios-ci.yml) uploads an **unsigned device archive** (`ios-device-unsigned` artifact) when `npm run tauri:ios:build:unsigned` succeeds — no Apple signing secrets required.

## Details

Xcode prerequisites, entitlements sync, Universal Links (AASA), OAuth, and App Store notes: [`docs/operations/ios-tauri.md`](../docs/operations/ios-tauri.md).
