import {
  isSafeRasterEmojiDataUrl,
  safeCustomEmojiUrl,
} from '@/features/chat/emoji/customEmojiUrl';
import {
  requiresBundledMediaFallback,
  safeImageUrl,
} from '@/features/layout/display/safeImageUrl';

const UNICODE_EMOJI_ICON_PREFIX = 'emoji:';

/** Persisted channel `iconKey` for a server custom emoji (snowflake id). */
export const CUSTOM_EMOJI_CHANNEL_ICON_PREFIX = 'custom-emoji:' as const;

const MAX_CHANNEL_ICON_KEY_URL_CHARS = 2048;

export type ChannelIconEmojiUrlLookup = (
  emojiId: string,
) => string | null | undefined;

export function parseCustomEmojiChannelIconKey(
  key: string | undefined | null,
): string | null {
  if (!key || typeof key !== 'string') return null;
  const t = key.trim();
  if (!t.startsWith(CUSTOM_EMOJI_CHANNEL_ICON_PREFIX)) return null;
  const id = t.slice(CUSTOM_EMOJI_CHANNEL_ICON_PREFIX.length).trim();
  if (!id || id.length > 64) return null;
  return id;
}

export function makeCustomEmojiChannelIconKey(emojiId: string): string {
  return `${CUSTOM_EMOJI_CHANNEL_ICON_PREFIX}${emojiId.trim()}`;
}

/**
 * True when `iconKey` is persisted as a raster image URL/path (custom emoji asset),
 * distinct from curated keys and `emoji:` unicode prefixes.
 */
export function isEchoChannelIconImageUrlKey(
  key: string | undefined | null,
): boolean {
  if (!key || typeof key !== 'string') return false;
  const t = key.trim();
  if (!t || t.length > MAX_CHANNEL_ICON_KEY_URL_CHARS) return false;
  if (parseCustomEmojiChannelIconKey(t)) return false;
  const lower = t.slice(0, 5).toLowerCase();
  if (lower.startsWith('data:')) return isSafeRasterEmojiDataUrl(t);
  if (
    t.startsWith('//') ||
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('/')
  ) {
    return true;
  }
  // CDN host paths without scheme (e.g. cdn.example.com/emotes/x.webp).
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(t)) return true;
  // Upload-relative filenames saved without a leading slash.
  return /\.(?:webp|png|gif|jpe?g)(?:\?|#|$)/i.test(t);
}

/** Safe `img` src for a persisted custom-emoji image URL icon key (legacy saves). */
export function resolveChannelIconImageUrlKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed || parseCustomEmojiChannelIconKey(trimmed)) return null;
  if (!isEchoChannelIconImageUrlKey(trimmed)) return null;
  const fromCustom = safeCustomEmojiUrl(trimmed);
  if (fromCustom) return fromCustom;
  if (trimmed.toLowerCase().startsWith('data:')) {
    return isSafeRasterEmojiDataUrl(trimmed) ? trimmed : null;
  }
  const safe = safeImageUrl(trimmed);
  if (requiresBundledMediaFallback(safe)) return null;
  return safe;
}

/**
 * Resolve raster channel icon URL from `custom-emoji:{id}` or legacy image URL keys.
 */
export function resolveChannelIconRasterUrl(
  iconKey: string | undefined | null,
  lookup?: ChannelIconEmojiUrlLookup,
): string | null {
  if (!iconKey || typeof iconKey !== 'string') return null;
  const key = iconKey.trim();
  if (!key) return null;

  const emojiId = parseCustomEmojiChannelIconKey(key);
  if (emojiId) {
    const raw = lookup?.(emojiId)?.trim();
    if (!raw) return null;
    return safeCustomEmojiUrl(raw) ?? null;
  }

  return resolveChannelIconImageUrlKey(key);
}

/** Monochrome SVG catalog icons use `filter: invert`; raster custom emoji must not. */
export function channelIconKeyUsesSvgInvertFilter(
  iconKey: string | undefined | null,
): boolean {
  if (!iconKey || typeof iconKey !== 'string') return false;
  const key = iconKey.trim();
  if (!key) return false;
  if (key.startsWith(UNICODE_EMOJI_ICON_PREFIX)) return false;
  if (parseCustomEmojiChannelIconKey(key)) return false;
  if (resolveChannelIconRasterUrl(key)) return false;
  return true;
}
