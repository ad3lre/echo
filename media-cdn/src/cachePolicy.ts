import {
  isEchoPublicEmojiCdnStorageKey,
  isEchoPublicServerBrandingStorageKey,
} from '../../shared/echoUploadStorageKey';

export function cacheControlForStorageKey(storageKey: string): string {
  const key = storageKey.trim();
  if (
    isEchoPublicServerBrandingStorageKey(key) ||
    isEchoPublicEmojiCdnStorageKey(key)
  ) {
    return 'public, max-age=31536000, immutable';
  }
  if (key.includes('/hls/') && /\.(m4s|ts)$/i.test(key)) {
    return 'public, max-age=86400';
  }
  if (key.endsWith('/hls/master.m3u8') || key.includes('/hls/')) {
    return 'private, max-age=300';
  }
  return 'private, max-age=300';
}
