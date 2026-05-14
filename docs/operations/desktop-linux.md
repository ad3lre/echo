# Echo desktop (Tauri, Linux)

**Release quick ref:** [`releases/desktop-linux.md`](../../releases/desktop-linux.md) — `.deb` / AppImage paths and build command.

Same Vue SPA and backend contract as [Windows](desktop-windows.md) and [macOS](desktop-macos.md). Platform-specific pieces: **WebKitGTK** (not WebView2), **.deb** / **AppImage** bundles, and the same Tauri WebView origins for cookies (`http://` / `https://tauri.localhost`, `tauri://localhost`; see [desktop-windows.md — Backend configuration](desktop-windows.md#backend-configuration)).

## Prerequisites

- **Node.js** 22.13+ (match repo root `package.json` `engines` and CI), **Rust** 1.80+ (`rustup`), **pkg-config**, and a C toolchain (`build-essential` on Debian/Ubuntu).
- **WebKitGTK 4.1** and GTK 3 dev headers (Tauri 2 / Wry). On **Debian/Ubuntu**:

  ```bash
  sudo apt update
  sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libxdo-dev
  ```

  The **Echo desktop** GitHub Actions job installs the same Debian/Ubuntu set on `ubuntu-latest` (see [`.github/workflows/echo-desktop-ci.yml`](../../.github/workflows/echo-desktop-ci.yml)).

- **Fedora** (typical):

  ```bash
  sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel openssl-devel gcc
  ```

- **Arch Linux** (rolling; package names track [Tauri prerequisites — Arch](https://v2.tauri.app/start/prerequisites/)):

  ```bash
  sudo pacman -S --needed \
    base-devel \
    webkit2gtk-4.1 \
    gtk3 \
    libayatana-appindicator \
    librsvg \
    patchelf \
    pkgconf \
    openssl \
    libxdo \
    curl \
    wget \
    file
  ```

  **CI:** Echo’s automated Linux desktop build uses **Ubuntu only** ([`.github/workflows/echo-desktop-ci.yml`](../../.github/workflows/echo-desktop-ci.yml)). The Arch block is for **local development** on Arch-based systems.

Adjust names if your distro ships slightly different packages; see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Local development

1. Run the Echo API (e.g. backend on `:3000`) as in normal web dev.
2. In repo root or `frontend/.env`:

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

### Wayland, X11, and global shortcuts

Tauri uses GTK/WebKit. If the window fails to open on some Wayland setups, try `GDK_BACKEND=x11` for troubleshooting.

**Global shortcuts** (Settings → Desktop → bring window to front) and **system tray** behavior can differ under **Wayland** vs X11: some compositors restrict global hotkeys or legacy tray protocols. That is largely an upstream / desktop-environment limitation, not Echo-specific. If the shortcut never registers, test under X11 or another session when isolating issues.

## Production build

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

Typical artifact locations:

- `src-tauri/target/release/bundle/deb/`
- `src-tauri/target/release/bundle/appimage/`

## Deep links

`echo://` is registered via `xdg-mime` / desktop entry when using the packaged `.deb` or AppImage. For development, behavior matches the [deep-link plugin](https://v2.tauri.app/plugin/deep-linking/) docs (often a second instance + `single-instance` forwarding).

## Backend

Same as Windows: `ECHO_DESKTOP_ALLOWED_ORIGINS` and merged `CORS_ORIGIN` (defaults include `http://tauri.localhost`, `https://tauri.localhost`, and `tauri://localhost`). See [desktop-windows.md](desktop-windows.md#backend-configuration).

## Manual QA (smoke)

After `npm run tauri:dev` or a packaged build:

- **Tray** — Icon appears; menu actions (Show Echo, Open Messages, Quit) work; left-click focuses the window where your DE supports it.
- **Close to tray** — With the option enabled, window close hides instead of exiting; Quit from tray exits.
- **Launch at login** — A desktop entry appears under `~/.config/autostart/` (or your distro’s equivalent) when enabled.
- **Deep link** — `echo://…` opens or focuses the app and applies navigation after install (dev often uses single-instance argv forwarding).
- **Unread / badge** — Unread state updates without crashing when the desktop supports dock badges (best-effort; some DEs ignore it).

## Early boot log (Linux)

Before Tauri initializes, the shell appends one **argv_boot** JSON line to `$XDG_STATE_HOME/com.echo.desktop/logs/echo-desktop.log`, or `~/.local/state/com.echo.desktop/logs/echo-desktop.log` when `XDG_STATE_HOME` is unset — mirroring the Windows pre-bootstrap log under `%LOCALAPPDATA%`. Failures are silent so a bad `$HOME` never blocks startup.
