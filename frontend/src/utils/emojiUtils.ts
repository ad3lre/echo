/**
 * Emoji detection and formatting utilities.
 */

const CUSTOM_EMOJI_TOKEN_RE = /<a?:[^:>]+:\d+>/g;
const APP_ICON_TOKEN_RE = /<icon:[^>\n]{1,200}>/g;
const HAS_EMOJI_RE = /\p{Extended_Pictographic}/u;
const GRAPHEME_SEGMENTER: Intl.Segmenter | null =
  typeof Intl?.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;

/** True when the string is only Discord custom emoji tokens (1–12) and whitespace. */
type TokenStrip = { tokenCount: number; remainder: string };

function stripEmojiLikeIdTokens(trimmed: string): TokenStrip {
  const custom = trimmed.match(CUSTOM_EMOJI_TOKEN_RE) ?? [];
  const icons = trimmed.match(APP_ICON_TOKEN_RE) ?? [];
  const remainder = trimmed
    .replace(CUSTOM_EMOJI_TOKEN_RE, '')
    .replace(APP_ICON_TOKEN_RE, '');
  return { tokenCount: custom.length + icons.length, remainder };
}

function countUnicodeEmojiOnlyWithSegmenter(
  trimmed: string,
  max: number,
): number | null {
  if (!GRAPHEME_SEGMENTER) return null;
  let count = 0;
  for (const part of GRAPHEME_SEGMENTER.segment(trimmed)) {
    const seg = part.segment;
    if (/^\s*$/.test(seg)) continue;
    count += 1;
    if (count > max) return null;
    if (!HAS_EMOJI_RE.test(seg)) return null;
  }
  return count > 0 ? count : 0;
}

/** Fallback when Intl.Segmenter is unsupported (older Safari, some Node). */
function countUnicodeEmojiOnlyFallback(
  trimmed: string,
  max: number,
): number | null {
  const emojiSequence =
    /\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|\uFE0F|\p{Emoji_Modifier})*/gu;
  const emojiMatches = trimmed.match(emojiSequence) ?? [];
  const withoutEmojiAndSpace = trimmed
    .replace(emojiSequence, '')
    .replace(/\s/g, '');
  if (withoutEmojiAndSpace.length > 0) return null;
  if (emojiMatches.length === 0 || emojiMatches.length > max) return null;
  return emojiMatches.length;
}

/**
 * Check if content is emoji-only (1–12 graphemes, all Extended_Pictographic).
 * Used to render emoji-only messages larger in the chat UI.
 * Uses Intl.Segmenter when available; falls back to regex on older Safari/Node.
 */
export function isEmojiOnlyUpTo12(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const { tokenCount, remainder } = stripEmojiLikeIdTokens(trimmed);
  const remainderHasNonSpace = remainder.replace(/\s/g, '').length > 0;
  if (!remainderHasNonSpace) return tokenCount > 0 && tokenCount <= 12;
  const remainingBudget = 12 - tokenCount;
  if (remainingBudget <= 0) return false;
  try {
    if (typeof Intl?.Segmenter === 'function') {
      const n = countUnicodeEmojiOnlyWithSegmenter(remainder, remainingBudget);
      return n !== null && tokenCount + n > 0;
    }
    const n = countUnicodeEmojiOnlyFallback(remainder, remainingBudget);
    return n !== null && tokenCount + n > 0;
  } catch {
    try {
      const n = countUnicodeEmojiOnlyFallback(remainder, remainingBudget);
      return n !== null && tokenCount + n > 0;
    } catch {
      return false;
    }
  }
}
