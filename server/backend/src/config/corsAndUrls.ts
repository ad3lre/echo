/**
 * Parses CORS_ORIGIN: single value or comma-separated list.
 * Default `true` reflects the request origin (non-production only). Auth uses `credentials: 'include'` — do not use `*`.
 * In `NODE_ENV=production`, startup fails unless `CORS_ORIGIN` is a non-empty explicit list (see production checks below).
 * Include every UI origin (e.g. Vite `http://localhost:8080` and preview `http://localhost:4173`) when not using the default.
 */
export function parseCorsOrigin(): string | string[] | true {
  const raw = process.env.CORS_ORIGIN;
  if (raw === undefined || raw === '*' || raw === '') return true;
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const first = origins[0];
  return origins.length === 1 && first !== undefined ? first : origins;
}

/** Default SPA URL for post-verify redirects when ECHO_APP_PUBLIC_URL is unset. */
export function defaultEchoAppPublicUrl(): string {
  const cors = parseCorsOrigin();
  if (typeof cors === 'string' && cors.startsWith('http')) return cors;
  if (Array.isArray(cors) && cors[0]?.startsWith('http')) return cors[0];
  return 'http://localhost:8080';
}

export function resolvedEchoAppPublicUrl(): string {
  return process.env.ECHO_APP_PUBLIC_URL?.trim() || defaultEchoAppPublicUrl();
}

/**
 * Discord matches `redirect_uri` to the portal list exactly (encoding/decoding aside).
 * Strip trailing slashes on the path — a common mistake is registering without `/` but
 * setting `.env` with one (or vice versa).
 */
export function normalizeDiscordOauthRedirectUri(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return t;
  }
}
