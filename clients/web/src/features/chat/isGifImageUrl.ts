import { isLikelyGifMediaUrl } from '@shared/gifHostLinks';
import { urlHostnameMatchesSuffix } from '@/features/chat/composables/hostMatches';

/** Whether a URL likely points to an animated GIF (or GIF host media) used for server/user media. */
export function isLikelyGifImageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (isLikelyGifMediaUrl(url)) return true;

  const t = url.trim().toLowerCase();

  /**
   * Discord animated avatars, banners, and icons use an asset id starting with `a_`
   * (often `.gif` or animated `.webp`). Those URLs frequently omit obvious `.gif`
   * markers in the query string, so `<img>` would otherwise loop forever.
   */
  if (/\/a_[^/?.]+\.[a-z0-9]+(\?|#|$)/i.test(t)) return true;
  if (
    /cdn\.discordapp\.(com|net)|media\.discordapp\.net/i.test(t) &&
    /\/a_/i.test(t)
  ) {
    return true;
  }

  /** Legacy: any Giphy/Tenor host (excluding viewer pages handled above). */
  const gifHosts = [
    'giphy.com',
    'media.giphy.com',
    'tenor.com',
    'tenor.co',
  ] as const;
  if (gifHosts.some((host) => urlHostnameMatchesSuffix(t, host))) {
    return !/\/view\/|\/gifs\/|\/gif\//i.test(t);
  }

  return false;
}
