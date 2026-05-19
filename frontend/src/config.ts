/**
 * Shared frontend configuration.
 *
 * - **Production / custom**: set `VITE_API_URL` to your API origin (e.g. `https://api.example.com`).
 * - **Built app without `VITE_API_URL` (e.g. `vite preview`)**: use **`window.location.origin`** so REST hits
 *   same-origin **`/api`** (Vite `preview.proxy` mirrors `server.proxy` — avoids split-port CORS on LAN).
 *   For split UI/API hosts (e.g. CDN + API subdomain), set **`VITE_API_URL`** at build time.
 * - **Local dev (default)**: REST uses the Vite origin (`/api` → proxy to Echo on :3000). Socket.IO defaults
 *   to `http://<same-hostname>:<VITE_DEV_ECHO_PORT>` (port 3000) so Engine.IO polling bypasses the Vite
 *   proxy (avoids flaky `/socket.io` proxy + 500s). Override with `VITE_SOCKET_IO_URL` or set `VITE_API_URL`
 *   to use one origin for both.
 * - **Prod “Invalid frame header” on `wss://…/socket.io`**: the browser expected WebSocket frames but got
 *   something else (often HTML from the SPA or an HTTP error). Check Caddy routes `/socket.io*` to the API
 *   *before* the SPA `try_files` catch-all; confirm Cloudflare does not cache or transform `/socket.io`;
 *   ensure `path` stays `/socket.io` (see `socketIoSessionWire.ts`). The service worker only intercepts GET
 *   fetch and does not apply to WebSocket upgrades.
 * - **Tauri shell (`VITE_ECHO_TAURI=1`)**: `VITE_API_URL` and `VITE_SOCKET_IO_URL` are **required** at build time
 *   (desktop and mobile WebViews are not same-origin with the API). Set via `VITE_ECHO_DESKTOP` /
 *   `VITE_ECHO_ANDROID` / `VITE_ECHO_IOS` npm scripts, which also set `VITE_ECHO_TAURI=1`.
 */

/** True when this bundle targets any Tauri shell (Echo desktop, Android, or iOS). */
export const IS_ECHO_TAURI_SHELL = import.meta.env.VITE_ECHO_TAURI === '1';

/** Echo HTTP/Socket port when UI talks to the API on the same host (default matches backend `PORT`). */
export function devEchoBackendPort(): string {
  const raw = (
    import.meta.env.VITE_DEV_ECHO_PORT as string | undefined
  )?.trim();
  if (raw && /^\d+$/.test(raw)) return raw;
  return '3000';
}

function resolveApiBase(): string {
  const isShellBuild = IS_ECHO_TAURI_SHELL;
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (isShellBuild) {
    if (env === undefined || env.trim() === '') {
      throw new Error(
        'Echo Tauri shell requires VITE_API_URL at build time (HTTPS API origin, e.g. https://api.example.com).',
      );
    }
    return env.replace(/\/$/, '');
  }
  if (env !== undefined && env !== '') {
    return env.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return 'http://localhost:8080';
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export const API_BASE = resolveApiBase();

/** Public site origin for shareable server links (no trailing slash). Override with `VITE_PUBLIC_INVITE_BASE`. */
export const PUBLIC_INVITE_BASE =
  (import.meta.env.VITE_PUBLIC_INVITE_BASE as string | undefined)?.replace(
    /\/$/,
    '',
  ) ?? 'https://chat-echo.com';

/** Origin used only for Socket.IO (see module docstring). */
function resolveSocketIoBase(): string {
  const isShellBuild = IS_ECHO_TAURI_SHELL;
  const socketUrl = import.meta.env.VITE_SOCKET_IO_URL as string | undefined;
  if (isShellBuild) {
    if (socketUrl === undefined || socketUrl.trim() === '') {
      throw new Error(
        'Echo Tauri shell requires VITE_SOCKET_IO_URL at build time (same host as the API, e.g. https://api.example.com).',
      );
    }
    return socketUrl.replace(/\/$/, '');
  }
  if (socketUrl !== undefined && socketUrl !== '') {
    return socketUrl.replace(/\/$/, '');
  }
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl !== undefined && apiUrl !== '') {
    return API_BASE;
  }
  if (import.meta.env.DEV) {
    // Direct to Echo on the same host as the UI (e.g. localhost:3000) — CORS is permissive in dev by default.
    // Proxied /socket.io through Vite is brittle for Engine.IO (polling POST, upgrades).
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:${devEchoBackendPort()}`;
    }
    return `http://127.0.0.1:${devEchoBackendPort()}`;
  }
  return API_BASE;
}

export const SOCKET_IO_BASE = resolveSocketIoBase();

/**
 * Enables desktop-native audio routing/playback path. Keep off by default until
 * rollout validation is complete.
 */
export const DESKTOP_NATIVE_AUDIO_ENABLED: boolean = (() => {
  if (import.meta.env.VITE_ECHO_DESKTOP !== '1') return false;
  const raw = (import.meta.env.VITE_DESKTOP_NATIVE_AUDIO as string | undefined)
    ?.trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

/**
 * Desktop-only: interval (ms) for silent `tauri-plugin-updater` checks. `0` disables.
 * Set `VITE_DESKTOP_UPDATE_CHECK_INTERVAL_MS` (e.g. `21600000` for 6h). Default 6h when unset on desktop builds.
 */
export const DESKTOP_UPDATE_CHECK_INTERVAL_MS: number = (() => {
  if (import.meta.env.VITE_ECHO_DESKTOP !== '1') return 0;
  const raw = (
    import.meta.env.VITE_DESKTOP_UPDATE_CHECK_INTERVAL_MS as string | undefined
  )?.trim();
  if (raw === '0' || raw === 'false') return 0;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 60_000 ? n : 0;
  }
  if (import.meta.env.DEV) return 0;
  return 6 * 60 * 60 * 1000;
})();
