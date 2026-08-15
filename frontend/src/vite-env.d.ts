/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_IO_URL?: string;
  /** Authoritative game-server Socket.IO origin (default dev: `http://<host>:3060`). */
  readonly VITE_GAME_SERVER_URL?: string;
  /** Dev game-server port when `VITE_GAME_SERVER_URL` is unset (default 3060). */
  readonly VITE_DEV_GAME_SERVER_PORT?: string;
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

interface Window {
  __echoBootDiagPush?: (
    stage: string,
    detail?: Record<string, unknown>,
  ) => void;
  __echoBootDiagSnapshot?: (label?: string) => void;
  __ECHO_BOOT_DIAG_QUEUE__?: unknown[];
}
