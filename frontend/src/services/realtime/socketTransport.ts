/** Set `VITE_DISABLE_SOCKET=true` to skip Socket.IO (e.g. no backend). */
export const SOCKET_DISABLED = import.meta.env.VITE_DISABLE_SOCKET === 'true';

/**
 * Socket.IO reports transport failures as "xhr poll error" (polling). One full page reload often
 * clears bad proxy/service-worker state; guard avoids an infinite reload loop if the backend stays down.
 */
export const ECHO_SOCKET_XHR_POLL_RELOAD_GUARD_KEY =
  'echo_socket_xhr_poll_reload_once';
