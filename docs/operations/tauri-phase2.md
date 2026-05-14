# Tauri desktop — Phase 2 roadmap

**Native release index:** [`releases/README.md`](../../releases/README.md) links artifact locations per platform.

Phase 1 (current): thin shell in [`src-tauri/`](../../src-tauri/), platform bundles ([`tauri.windows.conf.json`](../../src-tauri/tauri.windows.conf.json), [`tauri.linux.conf.json`](../../src-tauri/tauri.linux.conf.json), [`tauri.macos.conf.json`](../../src-tauri/tauri.macos.conf.json)), [`frontend/src/config.ts`](../../frontend/src/config.ts) desktop env, [`backend/src/auth/sessionCookies.ts`](../../backend/src/auth/sessionCookies.ts), [`frontend/src/platform/desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts).

Platform docs: [desktop-windows.md](desktop-windows.md) · [desktop-linux.md](desktop-linux.md) · [desktop-macos.md](desktop-macos.md).

## Status checklist

### 1. CI — reproducible `tauri build`

- [x] GitHub Actions workflow (matrix: Windows, Ubuntu, macOS) with path filters + `workflow_dispatch`
- [x] `VITE_API_URL` / `VITE_SOCKET_IO_URL` set to `https://chat-echo.com` in CI (same as production bundles; compile-only)
- [x] Cache npm + Rust `target/` where applicable
- [x] Windows installer artifacts on CI runs; Linux/macOS quick compile path; optional tag/manual Windows workflow ([`echo-desktop-release-windows.yml`](../../.github/workflows/echo-desktop-release-windows.yml))

**Workflow:** [`.github/workflows/echo-desktop-ci.yml`](../../.github/workflows/echo-desktop-ci.yml)

### 2. Signing and install trust

- [x] **Windows** — Documented: Authenticode + Tauri updater keys (see [desktop-windows.md](desktop-windows.md#code-signing-and-updater-keys))
- [x] **macOS** — Documented: Developer ID, notarization, updater keys (see [desktop-macos.md](desktop-macos.md#release-checklist-signing--notarization))
- [ ] **Linux** — Optional: Flathub/Snap (later); baseline: checksums + GPG notes

See [Signing (Windows)](#signing-windows) and [Signing (macOS)](#signing-macos) below.

### 3. In-app updates (`tauri-plugin-updater`)

- [x] Plugin wired in Rust + [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) (`plugins.updater`, public key from [`src-tauri/echo-update.key.pub`](../../src-tauri/echo-update.key.pub))
- [x] `bundle.createUpdaterArtifacts` — `false` by default so local/CI builds do not require a private signing key; set `true` for release builds that publish `.sig` files
- [x] `windows.installMode` — `passive` (silent install with a small progress UI) so users do not have to interact with the installer for each update
- [ ] Host **update JSON** (HTTPS) on your CDN; replace the `updates.echo.invalid` placeholder `endpoints` in [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json)
- [ ] CI secret: `TAURI_SIGNING_PRIVATE_KEY` (or `_PATH`) for signed release artifacts

The SPA now calls `check()` from **Settings → Desktop → Check for updates** (see [`frontend/src/platform/desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts)). Until `endpoints` points at a real CDN and signing secrets exist in CI, checks return errors or “no update” against the placeholder host. Rollout details: [desktop-updater-rollout.md](desktop-updater-rollout.md).

**Versioning:** bump `version` in [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) (and keep aligned with product versioning policy).

### 4. OAuth desktop handoff (Discord)

- [x] One-time code + redeem API + [`frontend/public/oauth-desktop-bridge.html`](../../frontend/public/oauth-desktop-bridge.html) + deep-link handling
- [ ] **Google** login — same pattern (follow-up)

Details: [oauth-desktop-bounce.md](oauth-desktop-bounce.md)

### 5. Nice-to-have (not scheduled)

- [ ] Sentry / native crash reporting (env-gated)
- [x] Native notifications for background attention (Tauri `plugin-notification` + [`useDesktopNativeAttention`](../../frontend/src/composables/useDesktopNativeAttention.ts); gated on personal **Desktop notifications**)
- [x] Windows tray + close-to-tray (see [`desktop-windows.md`](desktop-windows.md#windows-first-shell-phase-1)); macOS/Linux tray parity later

---

## Execution order (recommended)

1. Green **desktop CI** (unsigned artifacts).
2. **Signing** keys in secure storage; enable `createUpdaterArtifacts: true` only on release jobs.
3. **Updater** endpoint + ship first signed update.
4. Extend **Google** OAuth handoff to match Discord.

---

## Signing (Windows)

- Install **signtool** (Windows SDK) in CI (`windows-latest` includes it).
- Store certificate **PFX** or use a cloud signing service; set secrets for CI.
- Reference: [Tauri updater — signing builds](https://v2.tauri.app/plugin/updater/#signing-updates)

**CI env (conceptual):**

- `TAURI_SIGNING_PRIVATE_KEY` — minisign/Tauri private key string for update bundles (not the same as Authenticode; see Tauri docs for both).

## Signing (macOS)

- **Apple Developer Program** membership.
- Create **Developer ID Application** certificate; import into keychain on the builder.
- `codesign --options runtime` (Hardened Runtime), then `notarytool submit`, then `stapler staple`.
- Document entitlements if you add sandbox-sensitive APIs later.

**CI:** use a **macos** runner with signing certificates in keychain (ephemeral import from secrets) or Xcode Cloud patterns.

---

## Explicit non-goals

- Bundling the Echo **backend** inside Tauri.

**Android:** tracked separately — see [android-tauri.md](android-tauri.md). **iOS** remains out of scope here unless added later.
