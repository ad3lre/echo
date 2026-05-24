/**
 * Browser / tab lifecycle helpers used by `useSocket`: resume stalled connections,
 * deferred first connect, and listeners for bfcache + online + visibility + focus.
 *
 * Mobile Safari often kills WebSockets in background; `visibilitychange` usually fires on
 * return, but iOS also benefits from `focus` and Page Lifecycle `resume` / non-persisted
 * `pageshow` as extra nudges to reconnect Socket.IO.
 */

export function echoNavigatorAppearsOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * When the tab or network comes back, restart the realtime client if it is down.
 *
 * Always runs the full `connectSocket()` path (see `executeEchoSocketConnectAttempt`), which
 * discards a stale Socket instance and builds a fresh manager. The old behavior nudged
 * `socket.connect()` and returned when `io.socket` was non-null; a stalled Engine.IO session
 * could then never reach `ensureConnect()`, matching "Realtime disconnected" with no recovery.
 */
export function tryResumeEchoSocketConnection(opts: {
  socketOff: () => boolean;
  getConnected: () => boolean;
  ensureConnect: () => void | Promise<void>;
  /** Tab/network resume while Socket.IO is still connected (merge missed channel tail). */
  onConnectedResume?: () => void;
}): void {
  if (opts.socketOff()) return;
  if (opts.getConnected()) {
    opts.onConnectedResume?.();
    return;
  }
  if (!echoNavigatorAppearsOnline()) return;
  void opts.ensureConnect();
}

/** Deferred first `connectSocket()` from `onMounted` (idle when available). */
export function scheduleEchoSocketInitialConnect(opts: {
  onConnect: () => void;
}): () => void {
  if (typeof requestIdleCallback !== 'undefined') {
    const id = requestIdleCallback(opts.onConnect, { timeout: 4000 });
    return () => cancelIdleCallback(id);
  }
  const t = setTimeout(opts.onConnect, 0);
  return () => clearTimeout(t);
}

export function attachEchoSocketWindowResumeListeners(opts: {
  socketOff: () => boolean;
  onPersistedPageHide: () => void;
  onPersistedPageShow: () => void;
  onResumeRealtime: () => void;
}): () => void {
  const pageHide = (e: PageTransitionEvent) => {
    if (e.persisted) opts.onPersistedPageHide();
  };
  const pageShow = (e: PageTransitionEvent) => {
    if (opts.socketOff()) return;
    if (e.persisted) {
      opts.onPersistedPageShow();
      return;
    }
    // iOS / WKWebView: returning from app switcher may not use BFCache (`persisted` false)
    // but the socket is still dead — nudge reconnect when the page is visible again.
    if (document.visibilityState === 'visible') {
      opts.onResumeRealtime();
    }
  };
  const online = () => opts.onResumeRealtime();
  const visibility = () => {
    if (document.visibilityState === 'visible') opts.onResumeRealtime();
  };
  /** Window focus helps when `visibilitychange` is delayed (common on mobile). */
  const focus = () => {
    if (opts.socketOff()) return;
    if (document.visibilityState === 'visible') opts.onResumeRealtime();
  };
  /** Page Lifecycle API: fired when a frozen page becomes active again (Chrome; harmless elsewhere). */
  const lifecycleResume = () => {
    if (opts.socketOff()) return;
    opts.onResumeRealtime();
  };

  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);
  window.addEventListener('online', online);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('resume', lifecycleResume as EventListener);

  return () => {
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    window.removeEventListener('online', online);
    window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('resume', lifecycleResume as EventListener);
  };
}
