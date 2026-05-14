import { ECHO_SOCKET_XHR_POLL_RELOAD_GUARD_KEY } from '@/services/realtime/socketTransport';

export type SocketReloadGuardBrowser = {
  reload: () => void;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
};

export function defaultSocketReloadGuardBrowser(): SocketReloadGuardBrowser | null {
  if (typeof window === 'undefined') return null;
  if (!('sessionStorage' in window)) return null;
  return {
    reload: () => window.location.reload(),
    storage: window.sessionStorage,
  };
}

export function clearSocketXhrPollReloadGuard(
  browser: SocketReloadGuardBrowser | null,
): void {
  if (!browser) return;
  try {
    browser.storage.removeItem(ECHO_SOCKET_XHR_POLL_RELOAD_GUARD_KEY);
  } catch {
    // ignore
  }
}

export function tryReloadForSocketXhrPollError(
  browser: SocketReloadGuardBrowser | null,
): boolean {
  if (!browser) return false;
  try {
    if (browser.storage.getItem(ECHO_SOCKET_XHR_POLL_RELOAD_GUARD_KEY)) {
      return false;
    }
    browser.storage.setItem(ECHO_SOCKET_XHR_POLL_RELOAD_GUARD_KEY, '1');
  } catch {
    return false;
  }
  browser.reload();
  return true;
}
