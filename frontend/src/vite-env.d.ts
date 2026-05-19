/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * When `"1"`, the bundle runs inside any Tauri shell (desktop or Android).
   * Use for API origin / auth paths that are not same-origin with the API.
   */
  readonly VITE_ECHO_TAURI?: string;
  /** When `"1"`, build targets the Tauri desktop shell (`http://tauri.localhost`). */
  readonly VITE_ECHO_DESKTOP?: string;
  /** When `"1"`, build targets the Tauri Android shell. */
  readonly VITE_ECHO_ANDROID?: string;
  /** Desktop: silent updater poll interval (ms). `0` disables. Default production: 6h when unset. */
  readonly VITE_DESKTOP_UPDATE_CHECK_INTERVAL_MS?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_IO_URL?: string;
  /** When `"true"`, skip Socket.IO (mock-only UI; quieter console, better bfcache). */
  readonly VITE_DISABLE_SOCKET?: string;
  /** Override Socket.IO origin only (default dev: `http://localhost:3000` while REST uses Vite + `/api` proxy). */
  readonly VITE_SOCKET_IO_URL?: string;
  /**
   * When `"true"`, show `ScreenSharePickerModal` before screen capture.
   * Default (unset): browser goes straight to the OS/browser picker with best-effort options.
   */
  readonly VITE_SCREEN_SHARE_CONFIG_MODAL?: string;
}

declare module '*.md?raw' {
  const src: string;
  export default src;
}
