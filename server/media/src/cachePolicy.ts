import {
  isEchoPublicEmojiCdnStorageKey,
  isEchoPublicServerBrandingStorageKey,
} from '../../../contracts/echoUploadStorageKey';

export function cacheControlForStorageKey(storageKey: string): string {
  const key = storageKey.trim();
  if (
    isEchoPublicServerBrandingStorageKey(key) ||
    isEchoPublicEmojiCdnStorageKey(key)
  ) {
    return 'public, max-age=31536000, immutable';
  }
  // Match media HLS object-store cache policy (server/media/src/hls/objectStore.ts):
  // manifests are rewritten in place at a stable path → short public TTL + revalidation;
  // segments/init are content-addressed per pack → immutable for a year.
  if (key.toLowerCase().endsWith('.m3u8')) {
    return 'public, max-age=60, must-revalidate';
  }
  if (key.includes('/hls/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'private, max-age=300';
}

/** Deterministic resize/transcode URLs can cache longer than raw private objects. */
export function cacheControlForVariant(storageKey: string): string {
  const base = cacheControlForStorageKey(storageKey);
  if (base.includes('immutable')) return base;
  return 'private, max-age=86400';
}
