const KEY = 'echo_desktop_oauth_handoff_nonce_v1';
const KEY_RETURN = 'echo_desktop_oauth_return_path_v1';
const KEY_CODE = 'echo_desktop_oauth_handoff_code_v1';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createPendingDesktopOAuthHandoffNonce(): string {
  if (typeof sessionStorage === 'undefined') {
    throw new Error('desktop_oauth_handoff_storage_unavailable');
  }
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new Error('desktop_oauth_handoff_crypto_unavailable');
  }
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(KEY, nonce);
  return nonce;
}

/**
 * Remember where the user was in the SPA before we bounced them into system browser.
 * This is needed because the OAuth bridge page will run and then deep-link back into the app.
 * Without an explicit return path, we can get stuck on `oauth-desktop-bridge.html`.
 */
export function setPendingDesktopOAuthReturnPath(returnPath: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(KEY_RETURN, returnPath);
  } catch {
    /* ignore */
  }
}

export function readPendingDesktopOAuthReturnPath(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const p = sessionStorage.getItem(KEY_RETURN)?.trim() ?? '';
    return p || null;
  } catch {
    return null;
  }
}

export function clearPendingDesktopOAuthReturnPath(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY_RETURN);
  } catch {
    /* ignore */
  }
}

export function setPendingDesktopOAuthHandoffCode(code: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const trimmed = code.trim();
    if (trimmed) sessionStorage.setItem(KEY_CODE, trimmed);
  } catch {
    /* ignore */
  }
}

export function readPendingDesktopOAuthHandoffCode(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const code = sessionStorage.getItem(KEY_CODE)?.trim() ?? '';
    return code || null;
  } catch {
    return null;
  }
}

export function clearPendingDesktopOAuthHandoffCode(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY_CODE);
  } catch {
    /* ignore */
  }
}

export function readPendingDesktopOAuthHandoffNonce(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const nonce = sessionStorage.getItem(KEY)?.trim() ?? '';
    return nonce || null;
  } catch {
    return null;
  }
}

export function clearPendingDesktopOAuthHandoffNonce(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Clear all desktop OAuth bridge keys when a handoff attempt finishes (success or abandon). */
export function clearAllPendingDesktopOAuthHandoffState(): void {
  clearPendingDesktopOAuthHandoffNonce();
  clearPendingDesktopOAuthHandoffCode();
  clearPendingDesktopOAuthReturnPath();
}
