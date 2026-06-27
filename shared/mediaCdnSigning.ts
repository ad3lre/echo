import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  isEchoPublicMediaCdnStorageKey,
  MEDIA_CDN_DEFAULT_PRIVATE_READ_TTL_MS,
  MEDIA_CDN_DEFAULT_PUBLIC_READ_TTL_MS,
  MEDIA_CDN_MIN_READ_TTL_MS,
  type MediaCdnReadAudience,
  type MediaCdnReadScope,
  type MediaCdnReadTokenPayload,
} from './mediaCdn';
import { isSafeEchoUploadStorageKeyPath } from './echoUploadStorageKey';

function mediaCdnTokenMatchesRequestedKey(
  payload: MediaCdnReadTokenPayload,
  requestedStorageKey: string,
): boolean {
  const tokenKey = payload.storageKey.trim();
  const requested = requestedStorageKey.trim();
  if (!tokenKey || !requested) return false;
  if (payload.scope === 'prefix') {
    return requested === tokenKey || requested.startsWith(`${tokenKey}/`);
  }
  return requested === tokenKey;
}

export function signMediaCdnReadToken(
  secret: string,
  storageKey: string,
  opts?: {
    ttlMs?: number;
    scope?: MediaCdnReadScope;
    aud?: MediaCdnReadAudience;
  },
): string {
  const key = storageKey.trim();
  if (!isSafeEchoUploadStorageKeyPath(key)) {
    throw new Error('Invalid storage key for media CDN token');
  }
  const scope = opts?.scope ?? 'object';
  const aud = opts?.aud;
  if (aud === 'public' && !isEchoPublicMediaCdnStorageKey(key)) {
    throw new Error('Public audience requires a public media storage key');
  }
  const ttlMs =
    aud === 'public'
      ? (opts?.ttlMs ?? MEDIA_CDN_DEFAULT_PUBLIC_READ_TTL_MS)
      : (opts?.ttlMs ?? MEDIA_CDN_DEFAULT_PRIVATE_READ_TTL_MS);
  const payload: MediaCdnReadTokenPayload = {
    v: 2,
    storageKey: key,
    exp: Date.now() + Math.max(MEDIA_CDN_MIN_READ_TTL_MS, ttlMs),
    scope,
    ...(aud ? { aud } : {}),
  };
  const json = JSON.stringify(payload);
  const sig = createHmac('sha256', secret)
    .update(`media-cdn-read:${json}`)
    .digest('base64url');
  return `${Buffer.from(json, 'utf8').toString('base64url')}.${sig}`;
}

export function parseMediaCdnReadToken(
  token: string,
): MediaCdnReadTokenPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const jsonB64 = token.slice(0, dot);
  try {
    const json = Buffer.from(jsonB64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as MediaCdnReadTokenPayload;
    if (payload.v !== 2) return null;
    if (
      typeof payload.storageKey !== 'string' ||
      typeof payload.exp !== 'number' ||
      (payload.scope !== 'object' && payload.scope !== 'prefix')
    ) {
      return null;
    }
    if (payload.aud != null && payload.aud !== 'public') return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyMediaCdnReadToken(
  secret: string,
  token: string,
  requestedStorageKey: string,
): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const jsonB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let json: string;
  try {
    json = Buffer.from(jsonB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const expectedSig = createHmac('sha256', secret)
    .update(`media-cdn-read:${json}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  const payload = parseMediaCdnReadToken(token);
  if (!payload) return false;
  if (payload.exp < Date.now()) return false;
  return mediaCdnTokenMatchesRequestedKey(payload, requestedStorageKey);
}
