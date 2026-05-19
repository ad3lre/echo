# Android (Tauri)

Package id: `com.echo.app` (see `src-tauri/tauri.android.conf.json`).

## Artifacts (local build)

Gradle outputs (paths vary slightly by variant):

- `src-tauri/gen/android/app/build/outputs/**/*.aab`
- `src-tauri/gen/android/app/build/outputs/**/*.apk`

Generate/refesh `src-tauri/gen/android` when needed: `npm run tauri:android:init`.

## Build (repo root)

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:android:build
```

Preset for production Echo host: `npm run tauri:android:build:chat-echo`. Extra CLI args: pass after `--` (see `package.json` / `scripts/tauri-android-build.mjs`).

## CI

[`.github/workflows/echo-android-ci.yml`](../.github/workflows/echo-android-ci.yml) uploads **`android-universal-release`** (AAB/APK under `outputs/`) when files exist.

## Details

Signing (`keystore.properties`), Play versioning, OAuth/deep links: [`docs/operations/android-tauri.md`](../docs/operations/android-tauri.md).
