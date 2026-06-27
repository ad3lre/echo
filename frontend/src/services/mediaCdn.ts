import { echoFetch } from '@/api/echo/transport';
import {
  ECHO_MEDIA_CDN_OBJECT_PREFIX,
  extractStorageKeyFromMediaCdnUrl,
  type MediaCdnReadScope,
} from '@shared/mediaCdn';
import { extractStorageKeyFromEchoMediaUrl } from '@shared/echoUploadStorageKey';
import { rewriteR2EchoUploadUrlForReadThrough } from '@/utils/rewriteR2EchoUploadUrlForReadThrough';
import { encodeEchoUploadStorageKeyPath } from '@shared/mediaCdn';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from '@shared/echoS3ReadThrough';

type SignedCacheEntry = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, SignedCacheEntry>();

function signedCacheKey(storageKey: string, scope: MediaCdnReadScope): string {
  return `${scope}:${storageKey}`;
}

function mediaCdnBaseUrls(): string[] {
  const env = import.meta.env.VITE_MEDIA_CDN_BASE_URL as string | undefined;
  const bases = env?.trim() ? [env.trim().replace(/\/$/, '')] : [];
  return bases;
}

export function isEchoMediaCdnCanonicalUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (t.includes(ECHO_MEDIA_CDN_OBJECT_PREFIX)) return true;
  return (
    extractStorageKeyFromMediaCdnUrl(t, {
      httpMediaCdnBaseUrls: mediaCdnBaseUrls(),
    }) != null
  );
}

export function echoMediaUrlNeedsSigning(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:') || t.startsWith('blob:')) return false;
  if (/[?&]t=/.test(t)) return false;
  if (isEchoMediaCdnCanonicalUrl(t)) return true;
  return extractStorageKeyFromEchoMediaUrl(t) != null;
}

function readThroughFallbackUrlForStorageKey(storageKey: string): string {
  const encoded = encodeEchoUploadStorageKeyPath(storageKey);
  return rewriteR2EchoUploadUrlForReadThrough(
    `${ECHO_S3_PUBLIC_READ_THROUGH_PREFIX}${encoded}`,
  );
}

function resolveStorageKey(url: string, storageKey?: string): string | null {
  const direct = storageKey?.trim();
  if (direct) return direct;
  return (
    extractStorageKeyFromMediaCdnUrl(url, {
      httpMediaCdnBaseUrls: mediaCdnBaseUrls(),
    }) ??
    extractStorageKeyFromEchoMediaUrl(url) ??
    null
  );
}

function readCachedSignedUrl(
  storageKey: string,
  scope: MediaCdnReadScope,
): string | null {
  const hit = signedUrlCache.get(signedCacheKey(storageKey, scope));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now() + 60_000) {
    signedUrlCache.delete(signedCacheKey(storageKey, scope));
    return null;
  }
  return hit.url;
}

function rememberSignedUrl(
  storageKey: string,
  scope: MediaCdnReadScope,
  url: string,
  expiresAt: number,
): void {
  signedUrlCache.set(signedCacheKey(storageKey, scope), { url, expiresAt });
}

type MediaSignResponseItem = {
  storageKey: string;
  url: string;
  expiresAt: number;
  scope: MediaCdnReadScope;
};

type MediaSignResponse = {
  url?: string;
  expiresAt?: number;
  urls?: MediaSignResponseItem[];
};

async function postMediaSign(
  items: Array<{
    storageKey: string;
    scope?: MediaCdnReadScope;
    publicUrl?: string;
  }>,
): Promise<MediaSignResponseItem[]> {
  try {
    const data = await echoFetch<MediaSignResponse>(null, '/media/sign', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    if (Array.isArray(data.urls) && data.urls.length > 0) {
      return data.urls;
    }
    if (data.url && items[0]?.storageKey) {
      return [
        {
          storageKey: items[0].storageKey,
          url: data.url,
          expiresAt: data.expiresAt ?? Date.now() + 3_600_000,
          scope: items[0].scope ?? 'object',
        },
      ];
    }
  } catch {
    /* signing unavailable — caller falls back to read-through / direct URL */
  }
  return [];
}

export async function resolveSignedEchoMediaUrl(opts: {
  url: string;
  storageKey?: string;
  scope?: MediaCdnReadScope;
}): Promise<string> {
  const raw = opts.url.trim();
  if (!raw) return raw;
  if (!echoMediaUrlNeedsSigning(raw)) {
    return rewriteR2EchoUploadUrlForReadThrough(raw);
  }
  const storageKey = resolveStorageKey(raw, opts.storageKey);
  if (!storageKey) {
    return rewriteR2EchoUploadUrlForReadThrough(raw);
  }
  const scope = opts.scope ?? 'object';
  const cached = readCachedSignedUrl(storageKey, scope);
  if (cached) return cached;

  const signed = await postMediaSign([{ storageKey, scope, publicUrl: raw }]);
  const first = signed[0];
  if (first?.url) {
    rememberSignedUrl(storageKey, scope, first.url, first.expiresAt);
    return first.url;
  }
  // Unsigned media-cdn URLs 403; prefer cookie-authenticated API read-through.
  return readThroughFallbackUrlForStorageKey(storageKey);
}

export async function batchResolveSignedEchoMediaUrls(
  items: Array<{
    url: string;
    storageKey?: string;
    scope?: MediaCdnReadScope;
  }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pending: Array<{
    url: string;
    storageKey: string;
    scope: MediaCdnReadScope;
  }> = [];

  for (const item of items) {
    const raw = item.url.trim();
    if (!raw) continue;
    if (!echoMediaUrlNeedsSigning(raw)) {
      out.set(raw, rewriteR2EchoUploadUrlForReadThrough(raw));
      continue;
    }
    const storageKey = resolveStorageKey(raw, item.storageKey);
    if (!storageKey) {
      out.set(raw, rewriteR2EchoUploadUrlForReadThrough(raw));
      continue;
    }
    const scope = item.scope ?? 'object';
    const cached = readCachedSignedUrl(storageKey, scope);
    if (cached) {
      out.set(raw, cached);
      continue;
    }
    pending.push({ url: raw, storageKey, scope });
  }

  for (let i = 0; i < pending.length; i += 20) {
    const chunk = pending.slice(i, i + 20);
    const signed = await postMediaSign(
      chunk.map((row) => ({
        storageKey: row.storageKey,
        scope: row.scope,
        publicUrl: row.url,
      })),
    );
    for (const row of signed) {
      rememberSignedUrl(row.storageKey, row.scope, row.url, row.expiresAt);
      const match = chunk.find((c) => c.storageKey === row.storageKey);
      if (match) out.set(match.url, row.url);
    }
    for (const row of chunk) {
      if (!out.has(row.url)) {
        out.set(row.url, readThroughFallbackUrlForStorageKey(row.storageKey));
      }
    }
  }

  return out;
}

/** @internal test helper */
export function clearEchoMediaCdnSignedUrlCacheForTests(): void {
  signedUrlCache.clear();
}
