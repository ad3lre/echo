/**
 * YouTube / Vimeo URL parsing and canonical iframe player URLs for chat embeds.
 */

export function tryParseYoutubeVideoId(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg && /^[\w-]{10,12}$/.test(seg) ? seg : null;
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com'
    ) {
      if (u.pathname === '/watch' || u.pathname.startsWith('/watch')) {
        const v = u.searchParams.get('v');
        return v && /^[\w-]{10,12}$/.test(v) ? v : null;
      }
      const shorts = u.pathname.match(/^\/shorts\/([\w-]{10,12})/);
      if (shorts?.[1]) return shorts[1];
      const embed = u.pathname.match(/^\/embed\/([\w-]{10,12})/);
      if (embed?.[1]) return embed[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function tryParseVimeoId(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const h = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (h !== 'vimeo.com' && !h.endsWith('.vimeo.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const raw = parts[0] === 'video' && parts[1] ? parts[1] : parts[0];
    if (raw && /^\d{6,12}$/.test(raw)) return raw;
  } catch {
    return null;
  }
  return null;
}

export function youtubeIframeEmbedUrl(videoId: string): string {
  if (!/^[\w-]{10,12}$/.test(videoId)) return '';
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function vimeoIframeEmbedUrl(videoId: string): string {
  if (!/^\d{6,12}$/.test(videoId)) return '';
  return `https://player.vimeo.com/video/${videoId}`;
}

export type PlayableVideoKind = 'youtube' | 'vimeo';

export interface PlayableVideoRef {
  kind: PlayableVideoKind;
  embedUrl: string;
}

/**
 * Apply player URL flags we *can* control (still no access to internal button CSS).
 * YouTube/Vimeo decide control sizes; a smaller iframe makes the whole bar smaller in px.
 */
export function playableIframeSrc(ref: PlayableVideoRef): string {
  try {
    const u = new URL(ref.embedUrl);
    if (ref.kind === 'youtube') {
      if (!u.searchParams.has('modestbranding'))
        u.searchParams.set('modestbranding', '1');
      if (!u.searchParams.has('rel')) u.searchParams.set('rel', '0');
    } else {
      if (!u.searchParams.has('title')) u.searchParams.set('title', '0');
      if (!u.searchParams.has('byline')) u.searchParams.set('byline', '0');
      if (!u.searchParams.has('portrait')) u.searchParams.set('portrait', '0');
    }
    return u.toString();
  } catch {
    return ref.embedUrl;
  }
}

export function resolvePlayableVideoEmbed(embed: {
  url?: string;
  video?: { kind?: PlayableVideoKind; embedUrl?: string };
}): PlayableVideoRef | null {
  const v = embed.video;
  if (v?.embedUrl?.trim() && (v.kind === 'youtube' || v.kind === 'vimeo')) {
    const u = v.embedUrl.trim();
    if (/^https:\/\//i.test(u)) return { kind: v.kind, embedUrl: u };
  }
  const page = embed.url?.trim();
  if (!page) return null;
  const yt = tryParseYoutubeVideoId(page);
  if (yt) {
    const u = youtubeIframeEmbedUrl(yt);
    return u ? { kind: 'youtube', embedUrl: u } : null;
  }
  const vm = tryParseVimeoId(page);
  if (vm) {
    const u = vimeoIframeEmbedUrl(vm);
    return u ? { kind: 'vimeo', embedUrl: u } : null;
  }
  return null;
}
