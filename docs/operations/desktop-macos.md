# Echo desktop (Tauri, macOS)

**Release quick ref:** [`releases/desktop-macos.md`](../../releases/desktop-macos.md) — bundle paths and build command.

Same Vue SPA and backend contract as [Windows](desktop-windows.md) and [Linux](desktop-linux.md). The shell uses **WKWebView** (system WebKit). Bundle output is a **`.dmg`** (see `src-tauri/tauri.macos.conf.json`).

## Prerequisites

- **macOS** 10.15+ (follow [Tauri’s supported versions](https://v2.tauri.app/start/prerequisites/) if that moves).
- **Node.js** ≥22.13 (see root `package.json` `engines`), **Rust** 1.80+ (`rustup`).
- **Xcode Command Line Tools** (compiler, SDKs):

  ```bash
  xcode-select --install
  ```

Building **macOS app bundles or DMGs must run on a Mac** (Apple does not support cross-compiling the full GUI stack from Linux/Windows the way Rust alone might).

### Universal binaries (Apple Silicon + Intel)

To ship one binary for both architectures:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

Otherwise the default host target matches your Mac (e.g. `aarch64-apple-darwin` on Apple Silicon).

## Local development

1. Run the Echo API (e.g. on `http://localhost:3000`) as in normal web dev.
2. In the repo root or `frontend/.env`:

   ```env
   VITE_ECHO_DESKTOP=1
   VITE_API_URL=http://localhost:3000
   VITE_SOCKET_IO_URL=http://localhost:3000
   ```

3. From the repo root:

   ```bash
   npm install
   npm run tauri:dev
   ```

## Production build

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

Typical artifact path:

- `src-tauri/target/release/bundle/dmg/` (and the `.app` under `bundle/macos/` as produced by the bundler)

**Code signing & notarization** for distribution outside your machine are separate steps (Apple Developer Program, `codesign`, `notarization`); treat them as a release checklist, not part of this repo’s default build.

### Release checklist (signing + notarization)

- **Developer ID Application** certificate in the login keychain on the **macOS** builder (or imported in CI from a PKCS#12 secret).
- **`codesign`** with **Hardened Runtime** (`--options runtime`), appropriate entitlements if you add sandbox-sensitive APIs later.
- **`notarytool`** submission (`xcrun notarytool submit` with **App Store Connect API key** or Apple ID + app-specific password), then **`stapler staple`** on the shipped `.dmg` / `.app`.
- **CI secrets (conceptual)** — e.g. `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_API_KEY_ID`, `APPLE_API_KEY_ISSUER_ID`, `APPLE_API_KEY_PATH`, or equivalent for your pipeline; plus the **Tauri updater** minisign private key as **`TAURI_SIGNING_PRIVATE_KEY`** when publishing signed update artifacts.

See [tauri-phase2.md](tauri-phase2.md) and [Tauri — updater](https://v2.tauri.app/plugin/updater/).

## Deep links

The `echo://` scheme is registered for the installed app (see [Tauri deep linking](https://v2.tauri.app/plugin/deep-linking/)). The frontend handler in `frontend/src/platform/desktopDeepLink.ts` matches Windows/Linux behavior.

## Backend

Same as other desktops: `ECHO_DESKTOP_ALLOWED_ORIGINS` and merged `CORS_ORIGIN` (defaults include `http://tauri.localhost`, `https://tauri.localhost`, and `tauri://localhost`). See [desktop-windows.md — Backend configuration](desktop-windows.md#backend-configuration).
