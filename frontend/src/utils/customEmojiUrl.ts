import { isEchoPublicId } from '@shared/snowflakeIds';
import { sanitizeEmojiImgHtmlForVHtml } from '@/utils/sanitizeEmojiImgHtmlForVHtml';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

/** Inline raster data URLs from Discord export import (see backend `assetPathToDataUrl`). */
const MAX_CUSTOM_EMOJI_DATA_URL_CHARS = 26_000_000;

/**
 * Allow only raster `data:image/...;base64,...` URLs. SVG and other schemes are rejected
 * (`safeCustomEmojiUrl` previously dropped all `data:` URLs, which broke imported packs).
 */
export function isSafeRasterEmojiDataUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_CUSTOM_EMOJI_DATA_URL_CHARS)
    return false;
  if (/[\r\n]/.test(trimmed) || trimmed.includes('\0')) return false;
  const b64 = ';base64,';
  const semi = trimmed.indexOf(b64);
  if (semi < 12) return false;
  const meta = trimmed.slice(0, semi);
  if (!/^data:image\/(?:png|gif|webp|jpeg|jpg)\b/i.test(meta)) return false;
  if (/\bsvg\b/i.test(meta)) return false;
  return true;
}

export function safeCustomEmojiUrl(
  url: string | undefined | null,
): string | null {
  if (typeof url !== 'string') return null;
  let trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:')) {
    return isSafeRasterEmojiDataUrl(trimmed) ? trimmed : null;
  }
  // Backend/CDN can return host paths without scheme; normalize for robust rendering.
  if (
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|\?|#).*/i.test(trimmed)
  ) {
    trimmed = `https://${trimmed}`;
  }
  if (!isTrustedMediaUrl(trimmed)) return null;
  const safe = safeImageUrl(trimmed);
  if (!safe) return null;
  if (safe.toLowerCase().startsWith('data:')) return null;
  return safe;
}

export function renderCustomEmojiHtml(
  imageUrl: string | undefined | null,
  name: string,
): string | null {
  const safeUrl = safeCustomEmojiUrl(imageUrl);
  if (!safeUrl) return null;
  const alt = `:${name}:`;
  return sanitizeEmojiImgHtmlForVHtml(
    `<img class="emoji custom-emoji" draggable="false" alt="${escapeAttr(alt)}" src="${escapeAttr(safeUrl)}"/>`,
  );
}

/**
 * Discord serves custom emoji assets at predictable URLs (same id format as Echo public ids).
 * Only use after Echo’s `/emoji/resolve` has confirmed the emoji is not in the DB, otherwise
 * we could briefly point at a non-existent Discord asset for an unloaded Echo emoji.
 */
export function discordCdnCustomEmojiMediaUrl(
  id: string,
  animated: boolean,
): string {
  const t = id.trim();
  return animated
    ? `https://cdn.discordapp.com/emojis/${t}.gif`
    : `https://cdn.discordapp.com/emojis/${t}.png`;
}

export function fallbackDiscordCdnCustomEmojiImageUrl(
  id: string,
  animated: boolean,
): string | null {
  if (!isEchoPublicId(id)) return null;
  return safeCustomEmojiUrl(discordCdnCustomEmojiMediaUrl(id, animated));
}

/**
 * Prefer Echo-hosted URLs from `cachedById` (library + resolver cache). When
 * `echoResolveMissed` is true, Echo has no row for this id — use Discord’s CDN
 * so other guilds’ emojis render like Discord.
 */
export function resolveCustomEmojiImageUrlForDisplay(
  id: string,
  animated: boolean,
  cachedById: ReadonlyMap<string, string> | null | undefined,
  echoResolveMissed: boolean,
): string | null {
  const mid = id.trim();
  if (!mid) return null;
  const mapped = cachedById?.get(mid)?.trim();
  if (mapped) {
    const s = safeCustomEmojiUrl(mapped);
    if (s) return s;
  }
  if (echoResolveMissed)
    return fallbackDiscordCdnCustomEmojiImageUrl(mid, animated);
  return null;
}
