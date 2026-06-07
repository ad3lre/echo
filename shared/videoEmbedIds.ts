/**
 * YouTube / Vimeo URL parsing and canonical iframe player URLs for chat embeds.
 */

import { YOUTUBE_INTEGRATION_ENABLED } from './integrationKillSwitches';

const YT_VIDEO_ID_RE = /^[\w-]{10,12}$/;

function youtubeVideoIdFromPath(pathname: string): string | null {
  const shorts = pathname.match(/^\/shorts\/([\w-]{10,12})/);
  if (shorts?.[1]) return shorts[1];
  const embed = pathname.match(/^\/embed\/([\w-]{10,12})/);
  if (embed?.[1]) return embed[1];
  const live = pathname.match(/^\/live\/([\w-]{10,12})/);
  if (live?.[1]) return live[1];
  const legacyV = pathname.match(/^\/v\/([\w-]{10,12})/);
  if (legacyV?.[1]) return legacyV[1];
  return null;
}

export function tryParseYoutubeVideoId(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg && YT_VIDEO_ID_RE.test(seg) ? seg : null;
    }
    if (host === 'youtube-nocookie.com') {
      return youtubeVideoIdFromPath(u.pathname);
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com'
    ) {
      if (u.pathname === '/watch' || u.pathname.startsWith('/watch')) {
        const v = u.searchParams.get('v');
        return v && YT_VIDEO_ID_RE.test(v) ? v : null;
      }
      return youtubeVideoIdFromPath(u.pathname);
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

/**
 * Best-effort poster for in-chat video embeds (YouTube thumb, unfurl image, oEmbed thumbnail).
 */
export function videoEmbedPosterUrl(embed: {
  url?: string;
  image?: { url?: string };
  thumbnail?: { url?: string };
  video?: { kind?: PlayableVideoKind; embedUrl?: string };
}): string | null {
  const image = embed.image?.url?.trim();
  if (image) return image;
  const thumb = embed.thumbnail?.url?.trim();
  if (thumb) return thumb;
  const page = embed.url?.trim();
  if (page && YOUTUBE_INTEGRATION_ENABLED) {
    const yt = tryParseYoutubeVideoId(page);
    if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  }
  const ref = resolvePlayableVideoEmbed(embed);
  if (YOUTUBE_INTEGRATION_ENABLED && ref?.kind === 'youtube') {
    const m = ref.embedUrl.match(/\/embed\/([\w-]{10,12})/);
    if (m?.[1]) return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  }
  return null;
}

export function resolvePlayableVideoEmbed(embed: {
  url?: string;
  video?: { kind?: PlayableVideoKind; embedUrl?: string };
}): PlayableVideoRef | null {
  const v = embed.video;
  if (v?.embedUrl?.trim() && (v.kind === 'youtube' || v.kind === 'vimeo')) {
    if (v.kind === 'youtube' && !YOUTUBE_INTEGRATION_ENABLED) {
      // fall through to page URL / vimeo
    } else {
      const u = v.embedUrl.trim();
      if (/^https:\/\//i.test(u)) return { kind: v.kind, embedUrl: u };
    }
  }
  const page = embed.url?.trim();
  if (!page) return null;
  const yt = YOUTUBE_INTEGRATION_ENABLED ? tryParseYoutubeVideoId(page) : null;
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
