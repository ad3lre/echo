# Echo iOS (Tauri)

Native shell around the same Vue SPA as the web and desktop apps. **Bundle id (current):** `com.echo.tauri.ios.dev` ([`src-tauri/tauri.ios.conf.json`](../../src-tauri/tauri.ios.conf.json)) — distinct from Android `com.echo.app` and desktop `com.echo.desktop`.

**Android:** [android-tauri.md](android-tauri.md) · **Desktop:** [tauri-phase2.md](tauri-phase2.md)

## Prerequisites (developers)

- **Node** 22+ (repo root).
- **Xcode** 15+ on macOS with iOS SDK.
- **Rust** stable ≥ [`src-tauri/Cargo.toml`](../../src-tauri/Cargo.toml) `rust-version`; add targets:

  ```bash
  rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
  ```

- Run `npm ci` from the repo root.
- **Apple Developer Program** membership for device builds and App Store / TestFlight.

## First-time: generate `src-tauri/gen/apple`

```bash
npm run tauri:ios:init
```

Team id defaults to `bundle.iOS.developmentTeam` in [`tauri.ios.conf.json`](../../src-tauri/tauri.ios.conf.json). Override locally with `APPLE_DEVELOPMENT_TEAM`.

## Build commands

| Command                             | Purpose                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run tauri:ios:dev`             | Simulator / device dev against local Vite                                              |
| `npm run tauri:ios:dev:chat-echo`   | Dev WebView loads production `https://chat-echo.com`                                   |
| `npm run tauri:ios:build`           | Release archive (macOS + signing)                                                      |
| `npm run tauri:ios:build:chat-echo` | Production API URLs baked into the bundle                                              |
| `npm run tauri:ios:sim:chat-echo`   | Install simulator build pointed at chat-echo.com                                       |
| `npm run verify:ios-version`        | Align `package.json`, `tauri.ios.conf.json`, `Cargo.toml` versions before store upload |

## Universal Links (HTTPS → iOS app)

Public invite and navigation URLs use `https://chat-echo.com/...`. For iOS to open the native app instead of Safari, **both** sides must be configured.

### 1. Host Apple App Site Association (AASA)

The reference deployment must serve JSON (not the SPA shell) at:

`https://chat-echo.com/.well-known/apple-app-site-association`

**Generation:** [`scripts/generate-apple-app-site-association.mjs`](../../scripts/generate-apple-app-site-association.mjs) runs on every frontend `prebuild`. It reads:

| Source                                                                 | Field                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`src-tauri/tauri.ios.conf.json`](../../src-tauri/tauri.ios.conf.json) | `bundle.iOS.developmentTeam`, `identifier`                           |
| Env overrides                                                          | `APPLE_DEVELOPMENT_TEAM`, `ECHO_IOS_BUNDLE_ID`, `ECHO_APP_LINK_HOST` |
| Skip                                                                   | `ECHO_SKIP_APP_SITE_ASSOCIATION=1`                                   |

Output: [`frontend/public/.well-known/apple-app-site-association`](../../frontend/public/.well-known/apple-app-site-association) → copied to `frontend/dist` by Vite.

**Caddy:** Import [`scripts/deploy/templates/caddy-spa-security-headers.Caddyfile.snippet`](../../scripts/deploy/templates/caddy-spa-security-headers.Caddyfile.snippet) **before** the SPA `try_files` catch-all so AASA is served with `Content-Type: application/json`. Without that block, Caddy returns `index.html` and Apple rejects the association.

**Verify after deploy:**

```bash
npm run verify:aasa
# Live check (reference deployment):
ECHO_AASA_VERIFY_URL=https://chat-echo.com npm run verify:aasa
```

### 2. iOS app entitlements

[`src-tauri/gen/apple/echo-desktop_iOS/echo-desktop_iOS.entitlements`](../../src-tauri/gen/apple/echo-desktop_iOS/echo-desktop_iOS.entitlements) includes `applinks:chat-echo.com`. Enable **Associated Domains** for the App ID in the Apple Developer portal (same Team ID as `developmentTeam`).

### 3. Deep link handling (follow-up)

Desktop/Android use custom scheme `echo://` ([`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json)). HTTPS Universal Links on iOS also require `plugins.deep-link.mobile` entries for `https` + `chat-echo.com` and SPA handling for `https://` URLs from `@tauri-apps/plugin-deep-link` (today [`desktopDeepLink.ts`](../../frontend/src/platform/desktopDeepLink.ts) only merges `echo://` OAuth handoffs). Wire HTTPS before marketing Universal Links as fully supported in the native shell.

## OAuth / native auth

iOS uses a native login overlay ([`iosBootOrchestrator.ts`](../../frontend/src/services/auth/iosBootOrchestrator.ts), Keychain via [`ios_auth.rs`](../../src-tauri/src/ios_auth.rs)). OAuth return URLs must be registered in Discord/Google consoles and Echo backend allowlists for your production host.

## App Store (operational)

1. Bump version consistently (`npm run verify:ios-version`).
2. Use a **production** bundle identifier (replace `.dev` suffix when ready for store).
3. Regenerate AASA after bundle id change (`npm run build -w frontend` or deploy).
4. Upload via Xcode Organizer or CI notarization pipeline (not yet documented here).
