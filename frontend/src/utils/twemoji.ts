/**
 * Twemoji parsing utilities for chat input and message display.
 * Uses local Twemoji SVG assets (no CDN requests).
 * HTML returned here is sanitized for safe `v-html` (see sanitizeEmojiImgHtmlForVHtml).
 */

import twemoji from 'twemoji';
import { sanitizeEmojiImgHtmlForVHtml } from '@/utils/sanitizeEmojiImgHtmlForVHtml';

/**
 * Resolve a path under Vite's public/ folder for img src and fetch().
 * Uses `import.meta.env.BASE_URL` (root `/` on web and Tauri).
 */
export function publicAssetUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const normalized = path.replace(/^\//, '');
  if (base.startsWith('./') || base.startsWith('../')) {
    return `/${normalized}`;
  }
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${normalized}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * RGI sequences that `twemoji.convert.toCodePoint` spells with legacy ZWJ forms, while
 * Twemoji 15+ ships a single codepoint asset (e.g. 🙂‍↔️ → 1fae8.webp).
 */
const TWEMOJI_CODEPOINT_ALIASES: Readonly<Record<string, string>> = {
  '1f642-200d-2194-fe0f': '1fae8',
  '1f642-200d-2194': '1fae8',
  '1f642-200d-2195-fe0f': '1fae9',
  '1f642-200d-2195': '1fae9',
};

function resolveTwemojiIconForAsset(hexFromConvert: string): string {
  const lower = hexFromConvert.toLowerCase();
  return TWEMOJI_CODEPOINT_ALIASES[lower] ?? lower;
}

export const twemojiOpts = {
  callback: (icon: string) =>
    publicAssetUrl(`twemoji/${resolveTwemojiIconForAsset(icon)}.webp`),
};

const twemojiApi = twemoji as {
  test?: (s: string) => boolean;
  parse: (s: string, opts?: unknown) => string;
  convert?: { toCodePoint: (s: string) => string };
};

const TWEMOJI_ICON_CACHE = new Map<string, string | null>();
const TWEMOJI_ICON_CACHE_MAX = 2048;

function setTwemojiIconCache(emoji: string, icon: string | null): void {
  if (TWEMOJI_ICON_CACHE.size >= TWEMOJI_ICON_CACHE_MAX) {
    const oldest = TWEMOJI_ICON_CACHE.keys().next().value as string | undefined;
    if (oldest !== undefined) TWEMOJI_ICON_CACHE.delete(oldest);
  }
  TWEMOJI_ICON_CACHE.set(emoji, icon);
}

/**
 * Twemoji's parser normalizes codepoint sequences to real asset names
 * (e.g. ❣️ -> 2763, 1️⃣ -> 31-20e3) while preserving required FE0F in
 * ZWJ assets. We use that normalization instead of `toCodePoint` directly.
 */
function parseTwemojiIconFromEmoji(emoji: string): string | null {
  const parsed = twemojiApi.parse(emoji, {
    callback: (icon: string) => icon,
    attributes: () => ({ draggable: 'false' }),
  });
  if (!parsed || parsed === emoji) return null;
  const match = /<img\b[^>]*\bsrc="([^"]+)"/i.exec(parsed);
  return match?.[1]?.toLowerCase() ?? null;
}

function resolveTwemojiIconForEmoji(emoji: string): string | null {
  const cached = TWEMOJI_ICON_CACHE.get(emoji);
  if (cached !== undefined) return cached;
  const rawIcon = twemojiApi.convert?.toCodePoint(emoji)?.toLowerCase() ?? '';
  if (!rawIcon) {
    setTwemojiIconCache(emoji, null);
    return null;
  }
  const aliased = TWEMOJI_CODEPOINT_ALIASES[rawIcon];
  if (aliased) {
    setTwemojiIconCache(emoji, aliased);
    return aliased;
  }
  const parsedIcon =
    parseTwemojiIconFromEmoji(emoji) ?? resolveTwemojiIconForAsset(rawIcon);
  setTwemojiIconCache(emoji, parsedIcon);
  return parsedIcon;
}

function isAllAscii(segment: string): boolean {
  for (let i = 0; i < segment.length; i++) {
    if (segment.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function isEmojiGrapheme(segment: string): boolean {
  if (!segment) return false;
  if (isAllAscii(segment)) return false;
  if (typeof twemojiApi.test === 'function') {
    return twemojiApi.test(segment);
  }
  return twemojiApi.parse(segment) !== segment;
}

/** Skip work when no BMP / supplementary emoji blocks appear (aligned with message markdown). */
const EMOJI_CANDIDATE_RE = /[\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}]/u;

/** HTML tags and comments — sufficient for markdown/sanitized chat HTML (no `>` in unquoted attrs). */
const HTML_TAG_OR_COMMENT_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;

/**
 * Apply Twemoji to plain-text runs in an HTML string (no DOM). Does not skip `.katex` subtrees;
 * prefer the DOM walker in `applyTwemojiOutsideKatex` when `document` is available.
 */
export function applyTwemojiToHtmlString(html: string): string {
  if (!html.trim() || !EMOJI_CANDIDATE_RE.test(html)) return html;
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(HTML_TAG_OR_COMMENT_RE.source, 'g');
  while ((m = re.exec(html)) !== null) {
    const text = html.slice(last, m.index);
    if (text && EMOJI_CANDIDATE_RE.test(text)) {
      out.push(parseTextWithTwemoji(text));
    } else {
      out.push(text);
    }
    out.push(m[0]!);
    last = m.index + m[0]!.length;
  }
  const tail = html.slice(last);
  if (tail && EMOJI_CANDIDATE_RE.test(tail)) {
    out.push(parseTextWithTwemoji(tail));
  } else {
    out.push(tail);
  }
  return out.join('');
}

/**
 * Resolved URL for a single grapheme's Twemoji asset, or null if not an emoji Twemoji knows.
 */
export function getTwemojiSrc(emoji: string): string | null {
  const icon = resolveTwemojiIconForEmoji(emoji);
  if (!icon) return null;
  return publicAssetUrl(`twemoji/${icon}.webp`);
}

function emojiGlyphToImgHtml(emoji: string): string {
  const src = getTwemojiSrc(emoji);
  if (!src) return escapeHtml(emoji);
  return `<img class="emoji echo-emoji-inspect-target" draggable="false" alt="${escapeHtml(emoji)}" data-echo-unicode-emoji="${escapeHtml(emoji)}" src="${escapeHtml(src)}" loading="lazy"/>`;
}

/**
 * Parse a single emoji to Twemoji HTML, treating the full string as one unit.
 * Avoids `twemoji.parse()`, which splits some ZWJ sequences into multiple images.
 */
export function parseSingleEmoji(emoji: string): string {
  return sanitizeEmojiImgHtmlForVHtml(emojiGlyphToImgHtml(emoji));
}

/**
 * Parse text with emoji to Twemoji HTML (splits on emoji boundaries).
 */
export function parseTwemoji(emoji: string): string {
  return parseTextWithTwemoji(emoji);
}

/** Build Twemoji HTML from precomputed segments (one grapheme split pass). */
export function twemojiHtmlFromSegments(segments: TextSegment[]): string {
  const chunks = segments.map((seg) =>
    seg.type === 'text'
      ? escapeHtml(seg.value)
      : emojiGlyphToImgHtml(seg.value),
  );
  return sanitizeEmojiImgHtmlForVHtml(chunks.join(''));
}

/**
 * Parse text with HTML escaping and Twemoji conversion for emoji characters.
 */
export function parseTextWithTwemoji(text: string): string {
  return twemojiHtmlFromSegments(splitTextWithEmoji(text));
}

const EMOJI_SEQUENCE_FALLBACK =
  /\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|\uFE0F|\p{Emoji_Modifier})*/gu;

export type TextSegment =
  | { type: 'emoji'; value: string }
  | { type: 'text'; value: string };

/**
 * Split text into alternating emoji and text segments. Keeps Unicode emoji intact for copy.
 */
export function splitTextWithEmoji(text: string): TextSegment[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segments: TextSegment[] = [];
    let textBuf = '';
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const { segment } of seg.segment(text)) {
      if (isEmojiGrapheme(segment)) {
        if (textBuf) {
          segments.push({ type: 'text', value: textBuf });
          textBuf = '';
        }
        segments.push({ type: 'emoji', value: segment });
      } else {
        textBuf += segment;
      }
    }
    if (textBuf) segments.push({ type: 'text', value: textBuf });
    return segments;
  }

  const legacy: TextSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(EMOJI_SEQUENCE_FALLBACK.source, 'gu');
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      legacy.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    }
    legacy.push({ type: 'emoji', value: m[0]! });
    lastIndex = m.index + m[0]!.length;
  }
  if (lastIndex < text.length) {
    legacy.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return legacy;
}
