# Desktop updater — rollout checklist

Companion to [`tauri-phase2.md`](./tauri-phase2.md) and [`desktop-windows.md`](./desktop-windows.md).

## What ships in the repo today

- **Rust:** `tauri-plugin-updater` + `tauri-plugin-process` (relaunch after install).
- **Frontend:** [`frontend/src/platform/desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts) exposes `checkDesktopAppUpdate()` and `downloadAndRelaunchDesktopUpdate()`. **Settings → Desktop** runs manual checks. **Silent checks:** production desktop builds poll on an interval from [`DESKTOP_UPDATE_CHECK_INTERVAL_MS`](../../frontend/src/config.ts) (default **6 hours** when `VITE_DESKTOP_UPDATE_CHECK_INTERVAL_MS` is unset; **`0` / dev** disables). When an update exists, an in-app banner offers install + dismiss ([`AppLayout.vue`](../../frontend/src/features/layout/components/AppLayout.vue)).
- **Config:** [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) `plugins.updater` uses placeholder `endpoints` until operators replace them.
- **Release builds:** set **`ECHO_TAURI_UPDATER_ENDPOINTS`** (comma-separated HTTPS template URLs with `{{target}}`, `{{arch}}`, `{{current_version}}`) when invoking [`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs); the script patches `tauri.conf.json` for the build and restores it afterward (see script header). Set **`ECHO_TAURI_CREATE_UPDATER_ARTIFACTS=1`** on the same job when you intend to publish `.sig` update bundles.

## Operator steps

1. **Host update JSON** over HTTPS (Tauri v2 static JSON format per [Tauri updater](https://v2.tauri.app/plugin/updater/)). Replace `plugins.updater.endpoints` with your CDN URL template (`{{target}}`, `{{arch}}`, `{{current_version}}`).
2. **Signing:** set `TAURI_SIGNING_PRIVATE_KEY` (or `_PATH`) in release CI; align `pubkey` in `tauri.conf.json` with the published minisign public key.
3. **Artifacts:** for releases that publish updates, export **`ECHO_TAURI_CREATE_UPDATER_ARTIFACTS=1`** for the `tauri build` invocation (see [`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs)); the committed `tauri.conf.json` stays at `false` so local and PR builds never require a signing key.
4. **Versioning:** bump `version` in `tauri.conf.json` for each published channel; keep policy aligned with marketing/product version numbers.

## UX strategy (recommended)

| Phase             | Behavior                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Silent check      | Optional: on idle timer call `check()` with long interval; do not prompt on failure or “none”.                                              |
| User prompt       | When `check()` returns an `Update`, show in-app toast or modal with release notes (`body` / `rawJson`).                                     |
| Install + restart | User confirms → `downloadAndInstall()` then `relaunch()` from `@tauri-apps/plugin-process`.                                                 |
| Rollback          | Document last known-good installer link; Tauri passive install does not auto-rollback — keep previous MSI/NSIS on CDN for manual reinstall. |

## Windows notes

- `windows.installMode: "passive"` (already set) shows a small Microsoft installer UI suitable for unattended-ish upgrades.
- Authenticode-sign the **installer** separately from Tauri’s **update signature** (two different key materials; see `desktop-windows.md`).
