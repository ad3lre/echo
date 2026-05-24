# Echo desktop (Tauri, Windows)

**Release quick ref:** [`releases/desktop-windows.md`](../../releases/desktop-windows.md) — installer paths and CI workflow names.

Native shell around the same Vue SPA as the web app. **Linux:** [desktop-linux.md](desktop-linux.md). **macOS:** [desktop-macos.md](desktop-macos.md). The UI loads from the Tauri asset protocol / dev server; REST and Socket.IO use **explicit** origins baked in at build time (`VITE_API_URL`, `VITE_SOCKET_IO_URL`).

## Prerequisites

- **Node.js** 22+ (see root `package.json` `engines`; repo root: `npm install`)
- **Rust** 1.80+ (`rustup` recommended) and **Microsoft C++ Build Tools** (for Windows link step)
- **WebView2** — preinstalled on recent Windows 10/11; the NSIS/MSI installers can bootstrap it if missing

## Faster local iteration

- **Use `tauri dev` while coding** — `npm run tauri:dev` runs the Vite dev server with hot reload. Reserve `tauri build` for packaging smoke tests and releases (release compile + bundling is inherently slow).
- **Quick compile-only desktop check** — from repo root:
  ```powershell
  npm run tauri:build:quick
  ```
  This uses the same [`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs) entry as `tauri:build`: it skips installers (`--no-bundle`), applies `--no-sign` via the script, uses a faster Cargo profile (`release-fast`), and skips `vue-tsc` for the frontend bundle (`ECHO_TAURI_FAST_FRONTEND=1`). Updater env overrides (`ECHO_TAURI_UPDATER_ENDPOINTS`, `ECHO_TAURI_CREATE_UPDATER_ARTIFACTS`) apply here too. Run full typecheck in CI or with `npm run build -w frontend` before merging.
- **Rust compile cache (sccache)** — install once, then persist the wrapper (new terminal after `setx`):
  ```powershell
  cargo install sccache
  setx RUSTC_WRAPPER sccache
  ```
  Cargo documents `sccache` as a supported `rustc-wrapper` for shared incremental artifacts.
- **Faster Windows linker** — `src-tauri/.cargo/config.toml` sets `rust-lld.exe` for `x86_64-pc-windows-msvc` (LLD shipped with Rust). Remove that block if your toolchain cannot resolve the linker.
- **Avoid `cargo clean` unless necessary** — it invalidates incremental artifacts and makes the next desktop build much slower.
- **Default `npm run tauri:build` skips signing** — `scripts/tauri-build.mjs` passes `--no-sign` unless signing is explicitly enabled (see below). Use `npm run tauri:build:signed` or set `ECHO_TAURI_SIGN=1` on release agents that have certificates configured.

This repo uses **npm workspaces**; using **pnpm** locally is optional and not required for the scripts above.

## Local development

1. Start the Echo API (and Postgres, etc.) as for normal web dev, e.g. `npm run dev` from the repo root, or only the backend on `:3000` if you prefer.
2. Set **desktop** frontend env (repo root `.env` or `frontend/.env`; merged by Vite):

```env
 VITE_ECHO_DESKTOP=1
 VITE_API_URL=http://localhost:3000
 VITE_SOCKET_IO_URL=http://localhost:3000
```

`npm run tauri:dev` already sets `VITE_ECHO_DESKTOP=1` for the Vite child process; you still need the two URLs pointing at your API. 3. From the repo root:

```powershell
 npm run tauri:dev
```

This runs `tauri dev`, which starts `npm run dev -w frontend` and opens the shell against `http://localhost:8080`.

**Cookie note:** `SameSite=None` session cookies require a **secure** HTTPS API in real browsers. For pure `http://localhost` API + desktop WebView, prefer testing production-like HTTPS (e.g. tunneled or local TLS) or rely on staging.

## API connectivity (“Failed to fetch”, CORS)

The WebView origin (`https://tauri.localhost`, `tauri://localhost`, etc.) is **not** the same as `VITE_API_URL`, so REST calls are cross-origin. Echo merges desktop origins into `CORS_ORIGIN` and sets `Cross-Origin-Resource-Policy: cross-origin` on API responses so credentialed `fetch` can read JSON (see `backend/src/bootstrap/httpPlugins.ts`).

**Desktop bootstrap auth** (`/auth/guest`, `/auth/login`, `/auth/login/mfa`, `/auth/desktop/redeem-handoff`) uses **CORS-simple** `POST` bodies (`application/x-www-form-urlencoded` where a body is needed) so the browser does **not** send an `OPTIONS` preflight. Some CDNs or WAFs mishandle preflights; that pattern avoids them for sign-in.

**Authenticated Echo REST** (including `POST /api/v1/echo/uploads/presign` for profile photos) still uses JSON, `X-CSRF-Token`, and diagnostic headers, so the browser **will** preflight with `OPTIONS`. If email/password login works but uploads still fail with “Failed to fetch”, check DevTools **Network** for a blocked or non-2xx `**OPTIONS`** on the same path, and ensure your edge (e.g. **Cloudflare\*_) forwards `OPTIONS` and `Access-Control-Request-_` to Echo.

The packaged desktop **CSP** allows `connect-src` to `https:`, `wss:`, and `http://127.0.0.1:*` / `http://localhost:*` so a local HTTP API is not blocked by the shell (`src-tauri/tauri.conf.json`).

### Correlating the exact failing layer

To remove guesswork, desktop auth and upload requests now emit a **trace id** on the client and the backend keeps a recent in-memory ring buffer for:

- `/api/v1/auth/*`
- `/api/v1/echo/uploads/*`
- `OPTIONS` preflights that reach the backend for those paths

The backend view is exposed via **Bearer-token automation** (operators, CI, or a Cursor agent that can call your public API with server-side secrets):

- Set `ECHO_AGENT_NETWORK_DIAG_ENABLED=true` and `ECHO_AGENT_NETWORK_DIAG_TOKEN` on the API (see root `.env.example`).
- `GET /api/v1/agent/network-diagnostics` with header `Authorization: Bearer <ECHO_AGENT_NETWORK_DIAG_TOKEN>` and optional `traceId` / `limit` query parameters.
- When the feature is off, that path returns **404** so scanners do not get a trivial probe surface.

What to do when a user reproduces:

1. Reproduce once in the packaged desktop app.
2. Open the local desktop log and copy the `**traceId`\*\* from the relevant `[echo][auth][network]` or `[echo][api][network]` line.
3. Query `GET /api/v1/agent/network-diagnostics?traceId=<trace_id>` if you enabled the Bearer endpoint for tooling.

Interpretation:

- **No backend entry for that trace id**: the request never reached Echo. That usually means **CSP**, **browser CORS enforcement**, or your **edge/CDN/WAF** blocked it before the app.
- **Backend shows `OPTIONS` only, no final `POST`/`PATCH`**: preflight reached Echo (or at least your origin) but the browser never sent the real request. Investigate the **CORS response headers** and any proxy-layer rewrites.
- **Backend shows the final request with a response status**: the failure is now within Echo/application behavior, not blind transport guesswork.

## Production build

Set env for the **public** API (and matching Socket.IO origin), then:

```powershell
$env:VITE_API_URL="https://chat-echo.com"
$env:VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

Artifacts (typical paths):

- `src-tauri/target/release/bundle/nsis/` — NSIS `.exe` installer (default choice for most users).
- `src-tauri/target/release/bundle/msi/` — MSI for managed / enterprise-style installs.

This repo does **not** ship a separate “portable” zip by default; both formats above install WebView2 via `downloadBootstrapper` when needed (`src-tauri/tauri.windows.conf.json`).

**Keep versions aligned** when cutting a release: `version` appears in the root [`package.json`](../../package.json), [`src-tauri/Cargo.toml`](../../src-tauri/Cargo.toml), and [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) — bump together so the packaged app, updater metadata, and tags match.

### CI and release automation

- **PR / branch CI** — [`.github/workflows/echo-desktop-ci.yml`](../../.github/workflows/echo-desktop-ci.yml) runs a full Windows bundle (NSIS + MSI) and uploads those files as workflow **Artifacts** (retained 14 days; named with the run id). Linux and macOS jobs use a faster compile-only path (`tauri:build:quick`) so wall-clock time stays bounded by the Windows job.
- **Tags / manual Windows binaries** — [`.github/workflows/echo-desktop-release-windows.yml`](../../.github/workflows/echo-desktop-release-windows.yml) builds Windows installers on `workflow_dispatch` or when you push a tag matching `v*` (e.g. `v1.2.3`). Tag builds also create a **draft** GitHub Release and attach the same `.exe` / `.msi` files. Publish the draft after QA. Signing and updater keys remain optional repository secrets (same as local releases — see [Code signing and updater keys](#code-signing-and-updater-keys)).

`npm run tauri:build`, `npm run tauri:build:quick`, and `npm run tauri:build:local` all run through [`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs): it invokes the repo-local **`@tauri-apps/cli`** (`node_modules/@tauri-apps/cli/tauri.js`, not a global `tauri` on `PATH`), applies `--no-sign` unless `ECHO_TAURI_SIGN` opts in (table below), optionally patches `src-tauri/tauri.conf.json` for updater settings, then restores that file after the build. Extra `tauri build` flags (for example `--no-bundle` and Cargo profile args) are passed after the first `--` in the npm script—see root [`package.json`](../../package.json). Ensure `VITE_API_URL` / `VITE_SOCKET_IO_URL` are set for the session when you need real API endpoints (PowerShell example above).

## Code signing and updater keys

| Variable                              | Effect                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECHO_TAURI_SIGN`                     | `1` / `true` / `yes`: run `tauri build` **without** `--no-sign` so platform signing runs per `tauri.conf.json` (Windows thumbprint or `signCommand`, macOS identity, etc.). `0` / `false` / `no`: force `**--no-sign`** even if a parent shell exported a signing flag. Anything else or unset: `**--no-sign`\*\* (default for local machines and unsigned CI). |
| `ECHO_TAURI_UPDATER_ENDPOINTS`        | Comma-separated HTTPS template URLs (`{{target}}`, `{{arch}}`, `{{current_version}}`). When set, [`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs) patches `plugins.updater.endpoints` for the build and restores the file afterward.                                                                                                                  |
| `ECHO_TAURI_CREATE_UPDATER_ARTIFACTS` | `1` / `true` / `yes`: the same script sets `bundle.createUpdaterArtifacts` to `true` for that build so `.sig` update artifacts are emitted. Use only on release jobs together with `TAURI_SIGNING_PRIVATE_KEY` (or `_PATH`).                                                                                                                                    |

### `tauri-build.mjs` validation gates

[`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs) fails the build **before** invoking the Tauri CLI when:

- **`ECHO_TAURI_CREATE_UPDATER_ARTIFACTS`** is enabled but neither **`TAURI_SIGNING_PRIVATE_KEY`** nor **`TAURI_SIGNING_PRIVATE_KEY_PATH`** is set (prevents useless updater artifact runs).
- **`ECHO_TAURI_UPDATER_ENDPOINTS`** contains any URL that is not **`https:`** (each comma-separated entry must parse as a URL with that protocol).

PR / default **CI** jobs do not set these flags, so they keep using unsigned builds and the committed updater endpoints unchanged.

Convenience: `**npm run tauri:build:signed**` sets `ECHO_TAURI_SIGN=1` for the same script.

- **Installers (Authenticode)** — Sign NSIS/MSI with `signtool` and a **Developer**/**Code Signing** certificate (PFX in secure storage or a cloud signing service). Release CI should inject signing secrets via GitHub Actions (or your CI) **secrets**, never committed to the repo. Typical pattern: decode/import the PFX on the Windows runner (see [Tauri — Windows code signing](https://v2.tauri.app/distribute/sign/windows/)), ensure `bundle.windows` in `tauri.conf.json` has `certificateThumbprint` (and timestamp/digest as needed), then run `npm run tauri:build:signed` on that job only.
- **In-app updates (Tauri updater)** — Committed `tauri.conf.json` keeps `bundle.createUpdaterArtifacts` at `false` so dev/PR builds do not require a minisign private key. For releases, set `ECHO_TAURI_CREATE_UPDATER_ARTIFACTS=1` (handled by [`scripts/tauri-build.mjs`](../../scripts/tauri-build.mjs)) and set `**TAURI_SIGNING_PRIVATE_KEY`** (or `**TAURI_SIGNING_PRIVATE_KEY_PATH`**) to the **minisign** private key; the matching **public** key is embedded as `plugins.updater.pubkey`(see`[src-tauri/echo-update.key.pub](../../src-tauri/echo-update.key.pub)`). Never commit the private key (`.gitignore`lists`src-tauri/echo-update.key`).

See also [tauri-phase2.md](tauri-phase2.md) and [Tauri — updater](https://v2.tauri.app/plugin/updater/).

## Shell hardening (security notes)

- **`desktop_shell_save_file`** ([`src-tauri/src/main.rs`](../../src-tauri/src/main.rs)) — Intended only for paths returned from the native **Save** dialog (`saveDesktopBytesWithNativeDialog` in [`desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts)). The shell enforces a **64 MiB** payload cap, rejects `..` path segments and reserved Windows device names, and requires an **absolute** path. It is not a general-purpose filesystem API.
- **`log_frontend_event`** — Each line written to the desktop log file is **capped** (message length, number of `details` entries, and total serialized size) with a `truncated` flag when trimming occurs, so a buggy or hostile WebView cannot trivially fill the log disk.
- **`openExternal`** — If the system opener fails, **cross-origin** URLs are not loaded via `window.location.assign` inside the WebView (that would break the system-browser OAuth model). Same-origin URLs may still assign; otherwise the code falls back to `window.open(..., 'noopener,noreferrer')`.
- **Global shortcut** — The optional accelerator string in `localStorage` is validated client-side before `register()`; invalid values fall back to the default shortcut. Capabilities still include `global-shortcut:allow-unregister-all` so teardown can clear registrations.

## Backend configuration

- `**ECHO_DESKTOP_ALLOWED_ORIGINS`** — comma-separated list of WebView origins that may receive `SameSite=None` auth cookies and that are merged into `**CORS_ORIGIN`**. If unset, defaults include `http://tauri.localhost`, `**https://tauri.localhost**` (common for Tauri 2 packaged builds), and `tauri://localhost`. Production should set this explicitly if your shell uses a different origin.
- `**CORS_ORIGIN**` — must list every SPA origin that calls the API with credentials. Desktop origins are **merged automatically** from `ECHO_DESKTOP_ALLOWED_ORIGINS` (defaults included when unset).

## Deep links

The app registers the `echo://` scheme (see `src-tauri/tauri.conf.json`). `frontend/src/platform/desktopDeepLink.ts` merges `echo://…` query parameters into the SPA URL for **OAuth** (`echo_handoff`). **Product navigation** uses the same scheme with host **`open`** (handled in [`desktopProductDeepLink.ts`](../../frontend/src/platform/desktopProductDeepLink.ts), applied after workspace hydration via shell navigation):

| URL pattern                                                                 | Effect                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `echo://open/explore`                                                       | Opens Explore.                                                           |
| `echo://open/dm`                                                            | DM rail, messages tab.                                                   |
| `echo://open/dm/c/<channelId>` or `echo://open/dm?channelId=`               | Opens that DM / group thread.                                            |
| `echo://open/guild/<serverId>/<channelId>` or `?serverId=&channelId=`       | Guild text/voice surface for that channel.                               |
| `echo://open/settings?section=Notifications` (or `/settings/Notifications`) | Opens user settings modal on that section (must be a valid settings id). |

Only `echo:` is accepted; paths are validated before `history.pushState` + `popstate` sync.

**Discord sign-in in the system browser** starts with a **GET** to `/api/v1/auth/discord/login/start?desktopBrowserHandoff=1&desktopHandoffNonce=…` (opened externally — no credentialed `fetch` from the WebView), then `[oauth-desktop-bridge.html](../../frontend/public/oauth-desktop-bridge.html)` and `POST /api/v1/auth/desktop/redeem-handoff` complete the session (see [oauth-desktop-bounce.md](oauth-desktop-bounce.md)).

## Icons

Regenerate platform icons from the PWA asset:

```powershell
npm run tauri:icon
```

## Desktop shell (tray, window state, updates)

| Feature               | Where                                                                                                  | Notes                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System tray + menu    | [`src-tauri/src/main.rs`](../../src-tauri/src/main.rs) (`setup_desktop_tray`)                          | Show Echo, Open Messages, Toggle desktop alerts, Notification settings, Quit. Left-click tray focuses the window.                                                      |
| Tray tooltip          | Same + [`desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts) `setDesktopTrayTooltip`      | SPA mirrors unread attention (debounced).                                                                                                                              |
| Close → hide (tray)   | Same + `ShellPrefs.close_to_tray`                                                                      | When enabled, the main window **Close** hides instead of exiting. **Quit** from the tray exits the process. Default on new installs; toggle in **Settings → Desktop**. |
| Window geometry       | `tauri-plugin-window-state`                                                                            | Restores main window size/position between sessions.                                                                                                                   |
| Single-instance focus | `tauri-plugin-single-instance`                                                                         | Second launch focuses the existing window (unchanged).                                                                                                                 |
| OS notifications      | `@tauri-apps/plugin-notification` + [`desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts) | Driven by rising [`desktopAttentionScore`](../../frontend/src/stores/echoAttention.ts) when the document is hidden; respects personal **Desktop notifications**.       |
| Incoming call nudge   | [`useDesktopIncomingCallAttention`](../../frontend/src/composables/useDesktopIncomingCallAttention.ts) | Hidden document + ring UI → notification + critical taskbar attention (once per ring).                                                                                 |
| Launch at login       | `@tauri-apps/plugin-autostart`                                                                         | Toggle in **Settings → Desktop**.                                                                                                                                      |
| Updater               | `@tauri-apps/plugin-updater` + banner + **Desktop** settings                                           | See [desktop-updater-rollout.md](desktop-updater-rollout.md).                                                                                                          |

**Platform notes:** tray behavior can vary on Linux (Wayland / indicator hosts); failures are logged to the desktop log. Validate autostart entries per OS in QA.

Canonical attention mapping: [desktop-native-attention-hooks.md](desktop-native-attention-hooks.md).

## Troubleshooting

- `**tauri` / `cargo` not found\*\* — install Rust and ensure `%USERPROFILE%\.cargo\bin` is on `PATH`.
- **Blank window** — check devtools (Tauri) for CSP or failed chunk loads; confirm `VITE_API_URL` is set for desktop builds.
- **401 after login** — verify `CORS_ORIGIN` / `ECHO_DESKTOP_ALLOWED_ORIGINS` and HTTPS/`Secure` cookie requirements above.
- **Desktop runtime logs** — Echo now writes JSON lines to:
  - `%LOCALAPPDATA%\com.echo.desktop\logs\echo-desktop.log`
  - Includes startup, `console.warn`/`console.error`, `window.onerror`, and unhandled promise rejections from the desktop WebView.
