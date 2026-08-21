const STORAGE_KEY = 'echo_client_hwid_v1';

function randomUuidV4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Stable per-browser identifier sent with registration / guest mint when the server
 * enforces HWID+IP account caps (`ECHO_AUTH_HWID_ACCOUNT_CAP`).
 */
export function getOrCreateEchoClientHwid(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)?.trim();
    if (existing && existing.length >= 16) return existing.slice(0, 2048);
    const next = randomUuidV4();
    localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return randomUuidV4();
  }
}
