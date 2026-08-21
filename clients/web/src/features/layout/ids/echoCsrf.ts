const CSRF_COOKIES = ['__Host-echo_csrf', 'echo_csrf'];

/**
 * Survives full-page navigations (e.g. Discord OAuth) in the same tab. The API still receives the
 * `echo_csrf` cookie on credentialed cross-origin fetches; JS on the SPA host cannot read that
 * cookie, so we must resend the same value in `X-CSRF-Token` after memory is cleared.
 */
const CSRF_SESSION_STORAGE_KEY = 'echo_csrf_submit_v1';

/** When the SPA origin differs from the API origin, `echo_csrf` is not visible to `document.cookie` but still sent on credentialed requests. Cache the token from auth JSON (`csrfToken`) for `X-CSRF-Token`. */
let echoCsrfMemoryToken: string | null = null;

function readSessionStorageCsrf(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const v = sessionStorage.getItem(CSRF_SESSION_STORAGE_KEY)?.trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

function writeSessionStorageCsrf(token: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (token && token.trim())
      sessionStorage.setItem(CSRF_SESSION_STORAGE_KEY, token.trim());
    else sessionStorage.removeItem(CSRF_SESSION_STORAGE_KEY);
  } catch {
    /* quota / privacy mode */
  }
}

function readCookieRaw(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return part.slice(idx + 1).trim();
  }
  return undefined;
}

function tokenFromCookie(): string | undefined {
  for (const name of CSRF_COOKIES) {
    const raw = readCookieRaw(name);
    if (!raw) continue;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** Store CSRF secret from `GET /me`, login, refresh, etc. Pass `null` to drop the cached value. */
export function setEchoCsrfMemoryToken(token: string | null): void {
  const v = token && token.trim() ? token.trim() : null;
  echoCsrfMemoryToken = v;
  writeSessionStorageCsrf(v);
}

export function clearEchoCsrfMemoryToken(): void {
  echoCsrfMemoryToken = null;
  writeSessionStorageCsrf(null);
}

/** If the response body includes `csrfToken`, keep it for cross-origin double-submit CSRF. */
export function applyEchoCsrfFromAuthJson(data: Record<string, unknown>): void {
  const t = data.csrfToken;
  if (typeof t === 'string' && t.trim()) {
    setEchoCsrfMemoryToken(t.trim());
  }
}

/** Headers for mutating Echo API calls (double-submit CSRF). */
export function echoCsrfHeaders(): Record<string, string> {
  const fromCookie = tokenFromCookie();
  let mem = echoCsrfMemoryToken;
  if (!mem) {
    const fromSs = readSessionStorageCsrf();
    if (fromSs) {
      echoCsrfMemoryToken = fromSs;
      mem = fromSs;
    }
  }
  const token = fromCookie ?? mem ?? undefined;
  if (!token) return {};
  return { 'X-CSRF-Token': token };
}

export function echoCsrfJsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...echoCsrfHeaders() };
}
