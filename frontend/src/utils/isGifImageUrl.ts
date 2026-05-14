/** Whether a URL likely points to an animated GIF (or GIF host) used for server/user media. */
export function isLikelyGifImageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim().toLowerCase();
  if (t.startsWith('data:image/gif')) return true;
  if (/\.gif(\?|#|$)/i.test(t)) return true;
  if (/(^|[?&])format=gif([&#]|$)/i.test(t)) return true;
  if (
    t.includes('giphy.com') ||
    t.includes('media.giphy') ||
    t.includes('tenor.com') ||
    t.includes('tenor.co')
  ) {
    return true;
  }

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

  return false;
}
