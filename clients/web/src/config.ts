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
 */

/** Echo HTTP/Socket port when UI talks to the API on the same host (default matches backend `PORT`). */
export function devEchoBackendPort(): string {
  const raw = (
    import.meta.env.VITE_DEV_ECHO_PORT as string | undefined
  )?.trim();
  if (raw && /^\d+$/.test(raw)) return raw;
  return '3000';
}

function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
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
  const socketUrl = import.meta.env.VITE_SOCKET_IO_URL as string | undefined;
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

/** Echo game-server port when UI talks to the service on the same host (default 3060). */
export function devGameServerPort(): string {
  const raw = (
    import.meta.env.VITE_DEV_GAME_SERVER_PORT as string | undefined
  )?.trim();
  if (raw && /^\d+$/.test(raw)) return raw;
  return '3060';
}

/** Origin used for authoritative VC game Socket.IO (see module docstring). */
function resolveGameServerBase(): string {
  const env = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
  if (env !== undefined && env !== '') {
    return env.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:${devGameServerPort()}`;
    }
    return `http://127.0.0.1:${devGameServerPort()}`;
  }
  return API_BASE;
}

export const GAME_SERVER_BASE = resolveGameServerBase();

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

/**
 * Pick a browser-reachable game-server origin for Socket.IO.
 * Backend mint responses default to loopback in dev; when the UI is loaded from
 * another host (LAN IP, tunnel, custom domain), connect via {@link GAME_SERVER_BASE}.
 */
export function resolveGameServerConnectUrl(mintedUrl?: string | null): string {
  if (import.meta.env.VITE_GAME_SERVER_URL?.trim()) {
    return resolveGameServerBase();
  }
  const fromMint = mintedUrl?.trim() ?? '';
  const fallback = resolveGameServerBase();
  if (!fromMint) return fallback;
  if (typeof window === 'undefined') return fromMint;
  try {
    const minted = new URL(fromMint);
    if (
      isLoopbackHostname(minted.hostname) &&
      !isLoopbackHostname(window.location.hostname)
    ) {
      return fallback;
    }
  } catch {
    /* use minted */
  }
  return fromMint;
}

/**
 * Voice E2EE v2 (MLS / RFC 9420). When on, voice calls use the MLS group-key
 * protocol with in-band epoch rotation — the same architecture as Discord's
 * DAVE protocol — instead of the legacy static-seed + per-device envelope
 * scheme (which cannot rekey late joiners). On by default; set
 * `VITE_VOICE_E2EE_V2=0` to fall back to the legacy v1 scheme.
 */
export const VOICE_E2EE_V2_ENABLED: boolean = (() => {
  const raw = (import.meta.env.VITE_VOICE_E2EE_V2 as string | undefined)
    ?.trim()
    .toLowerCase();
  return !(raw === '0' || raw === 'false' || raw === 'no' || raw === 'off');
})();

/**
 * LiveKit E2EE for DM / group-DM ("private") calls. On by default: the client
 * always attempts E2EE key preparation for private calls; the backend's
 * `ECHO_DM_VOICE_E2EE_ENABLED` flag is the source of truth, and when the
 * server reports E2EE disabled the call proceeds with transport encryption
 * only. Set `VITE_DM_VOICE_E2EE=0` to skip client-side preparation entirely.
 */
export const DM_VOICE_E2EE_ENABLED: boolean = (() => {
  const raw = (import.meta.env.VITE_DM_VOICE_E2EE as string | undefined)
    ?.trim()
    .toLowerCase();
  return !(raw === '0' || raw === 'false' || raw === 'no' || raw === 'off');
})();

/**
 * Desktop-native audio routing/playback. The web SPA has no native audio host,
 * so this is permanently off; the voice stack keeps its `isDesktop() && …`
 * guards for the native clients under `clients/apple/`.
 */
export const DESKTOP_NATIVE_AUDIO_ENABLED = false;
