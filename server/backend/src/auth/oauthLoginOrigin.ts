import { config } from '../config';

function normalizeAppPublicOrigin(): string | null {
  const raw = config.echoAppPublicUrl.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function parseRequestOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function parseRefererOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

/**
 * When Sec-Fetch-Site is absent (non-browser clients), require Origin or Referer to
 * match `ECHO_APP_PUBLIC_URL` exactly — not prefix matching (blocks `https://app.com.evil`).
 */
export function isOAuthLoginStartOriginAllowed(headers: {
  origin?: string | string[];
  referer?: string | string[];
}): boolean {
  const appOrigin = normalizeAppPublicOrigin();
  if (!appOrigin) return false;

  const originRaw = Array.isArray(headers.origin)
    ? headers.origin[0]
    : headers.origin;
  const refererRaw = Array.isArray(headers.referer)
    ? headers.referer[0]
    : headers.referer;

  const origin = parseRequestOrigin(originRaw);
  if (origin) return origin === appOrigin;

  const refererOrigin = parseRefererOrigin(refererRaw);
  if (refererOrigin) return refererOrigin === appOrigin;

  return false;
}
