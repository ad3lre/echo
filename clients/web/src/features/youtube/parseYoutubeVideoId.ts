/** Extract an 11-character YouTube video id from a URL or raw id string. */
export function parseYoutubeVideoId(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
      return /^[a-zA-Z0-9_-]{11}$/.test(seg) ? seg : null;
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com'
    ) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts?.[1]) return shorts[1];
      const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed?.[1]) return embed[1];
      const live = u.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})/);
      if (live?.[1]) return live[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubePrivacyEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`;
}
