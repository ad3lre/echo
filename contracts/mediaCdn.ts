import {
  isEchoPublicEmojiCdnStorageKey,
  isEchoPublicServerBrandingStorageKey,
  normalizeEchoUploadStorageKeyPath,
} from './echoUploadStorageKey';

/** Object GET path on the media-cdn sidecar (append slash-encoded storage key). */
export const ECHO_MEDIA_CDN_OBJECT_PREFIX = '/v1/o/';

export const ECHO_MEDIA_CDN_TOKEN_QUERY_PARAM = 't';

export type MediaCdnReadScope = 'object' | 'prefix';

export type MediaCdnReadAudience = 'public';

export type MediaCdnReadTokenPayload = {
  v: 2;
  storageKey: string;
  exp: number;
  scope: MediaCdnReadScope;
  aud?: MediaCdnReadAudience;
};

export const MEDIA_CDN_DEFAULT_PRIVATE_READ_TTL_MS = 60 * 60 * 1000;
export const MEDIA_CDN_DEFAULT_PUBLIC_READ_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MEDIA_CDN_MIN_READ_TTL_MS = 60_000;

export function isEchoPublicMediaCdnStorageKey(storageKey: string): boolean {
  return (
    isEchoPublicServerBrandingStorageKey(storageKey) ||
    isEchoPublicEmojiCdnStorageKey(storageKey)
  );
}

export function encodeEchoUploadStorageKeyPath(storageKey: string): string {
  return storageKey.split('/').map(encodeURIComponent).join('/');
}

function decodeStorageKeyPath(encodedPath: string): string | null {
  try {
    const segments = encodedPath.split('/').filter((s) => s.length > 0);
    if (!segments.length) return null;
    const decoded = segments.map((seg) => decodeURIComponent(seg)).join('/');
    return normalizeEchoUploadStorageKeyPath(decoded);
  } catch {
    return null;
  }
}

export function buildMediaCdnObjectUrl(
  baseUrl: string,
  storageKey: string,
  token?: string,
): string {
  const base = baseUrl.replace(/\/$/, '');
  const encoded = encodeEchoUploadStorageKeyPath(storageKey);
  const path = `${base}${ECHO_MEDIA_CDN_OBJECT_PREFIX}${encoded}`;
  if (!token?.trim()) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${ECHO_MEDIA_CDN_TOKEN_QUERY_PARAM}=${encodeURIComponent(token.trim())}`;
}

export type ExtractStorageKeyFromMediaCdnUrlOptions = {
  /** Absolute HTTP(S) media CDN base URLs (no trailing slash). */
  httpMediaCdnBaseUrls?: readonly string[];
};

export function extractStorageKeyFromMediaCdnUrl(
  url: string,
  opts?: ExtractStorageKeyFromMediaCdnUrlOptions,
): string | null {
  const t = url.trim();
  if (!t) return null;

  const tryPathSuffix = (pathname: string, prefix: string): string | null => {
    if (!pathname.startsWith(prefix)) return null;
    return decodeStorageKeyPath(pathname.slice(prefix.length));
  };

  if (t.startsWith(ECHO_MEDIA_CDN_OBJECT_PREFIX)) {
    return decodeStorageKeyPath(t.slice(ECHO_MEDIA_CDN_OBJECT_PREFIX.length));
  }

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fromPath = tryPathSuffix(u.pathname, ECHO_MEDIA_CDN_OBJECT_PREFIX);
      if (fromPath) return fromPath;

      for (const base of opts?.httpMediaCdnBaseUrls ?? []) {
        const normalized = base.replace(/\/$/, '');
        if (!normalized.startsWith('http')) continue;
        const prefix = `${normalized}${ECHO_MEDIA_CDN_OBJECT_PREFIX}`;
        if (t.startsWith(prefix)) {
          return decodeStorageKeyPath(t.slice(prefix.length).split('?')[0]!);
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}
