const KEY = 'echo_desktop_oauth_handoff_nonce_v1';
const KEY_RETURN = 'echo_desktop_oauth_return_path_v1';
const KEY_CODE = 'echo_desktop_oauth_handoff_code_v1';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** sessionStorage is fast; localStorage survives cold start after Safari OAuth. */
function writeHandoffStorage(key: string, value: string): void {
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}

function readHandoffStorage(key: string): string | null {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const session = sessionStorage.getItem(key)?.trim() ?? '';
      if (session) return session;
    } catch {
      /* ignore */
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const local = localStorage.getItem(key)?.trim() ?? '';
      if (local) return local;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function removeHandoffStorage(key: string): void {
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function createPendingDesktopOAuthHandoffNonce(): string {
  if (
    typeof sessionStorage === 'undefined' &&
    typeof localStorage === 'undefined'
  ) {
    throw new Error('desktop_oauth_handoff_storage_unavailable');
  }
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new Error('desktop_oauth_handoff_crypto_unavailable');
  }
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  writeHandoffStorage(KEY, nonce);
  return nonce;
}

/**
 * Remember where the user was in the SPA before we bounced them into system browser.
 * This is needed because the OAuth bridge page will run and then deep-link back into the app.
 * Without an explicit return path, we can get stuck on `oauth-desktop-bridge.html`.
 */
export function setPendingDesktopOAuthReturnPath(returnPath: string): void {
  writeHandoffStorage(KEY_RETURN, returnPath);
}

export function readPendingDesktopOAuthReturnPath(): string | null {
  return readHandoffStorage(KEY_RETURN);
}

export function clearPendingDesktopOAuthReturnPath(): void {
  removeHandoffStorage(KEY_RETURN);
}

export function setPendingDesktopOAuthHandoffCode(code: string): void {
  const trimmed = code.trim();
  if (trimmed) writeHandoffStorage(KEY_CODE, trimmed);
}

export function readPendingDesktopOAuthHandoffCode(): string | null {
  return readHandoffStorage(KEY_CODE);
}

export function clearPendingDesktopOAuthHandoffCode(): void {
  removeHandoffStorage(KEY_CODE);
}

export function readPendingDesktopOAuthHandoffNonce(): string | null {
  return readHandoffStorage(KEY);
}

export function clearPendingDesktopOAuthHandoffNonce(): void {
  removeHandoffStorage(KEY);
}

/** Clear all desktop OAuth bridge keys when a handoff attempt finishes (success or abandon). */
export function clearAllPendingDesktopOAuthHandoffState(): void {
  clearPendingDesktopOAuthHandoffNonce();
  clearPendingDesktopOAuthHandoffCode();
  clearPendingDesktopOAuthReturnPath();
}
