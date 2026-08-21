import {
  countEmojiLikeGraphemes,
  isEmojiOnlyUpTo12,
} from '@/features/chat/emoji/emojiUtils';
import { extractMarkdownMathRegions } from '@/features/chat/markdown/markdownMathRegions';

/** Matches `.message-text--emoji-only` glyph size in messageBubble.scss. */
export const MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX = 48;
/** Rough wrap count at typical in-chat column width before live measure. */
export const MESSAGE_LIST_EMOJI_ONLY_GLYPHS_PER_ROW = 7;
/** Matches `.message-text` line-height (1.375rem) in messageBubble.scss. */
export const MESSAGE_LIST_BODY_LINE_PX = 22;
/** Avg glyphs per rendered line inside the message column before soft-wrap (rough). */
export const MESSAGE_LIST_CHARS_PER_LINE = 100;
/** Cap line contribution so a wall of text cannot blow past the row max. */
export const MESSAGE_LIST_MAX_BODY_LINES = 12;
/**
 * Conservative floor per display-math block before KaTeX typeset.
 * Under-estimate + absolute rows = bleed into the next message; remasure corrects up.
 */
export const MESSAGE_LIST_DISPLAY_MATH_BLOCK_FLOOR_PX = 88;
/** Small pad for inline math (taller than plain glyphs once typeset). */
export const MESSAGE_LIST_INLINE_MATH_EXTRA_PX = 6;

const CUSTOM_EMOJI_TOKEN_RE = /<a?:[^:>]+:\d+>/g;

export function countCustomEmojiTokens(text: string): number {
  return text.match(CUSTOM_EMOJI_TOKEN_RE)?.length ?? 0;
}

/** Rendered line count: explicit newlines plus per-line soft-wrap by width. */
export function estimateRenderedBodyLines(body: string): number {
  if (!body) return 1;
  let lines = 0;
  for (const segment of body.split('\n')) {
    lines += Math.max(
      1,
      Math.ceil(segment.length / MESSAGE_LIST_CHARS_PER_LINE),
    );
  }
  return Math.max(1, lines);
}

function estimateEmojiOnlyBodyHeightPx(body: string): number {
  const count = countEmojiLikeGraphemes(body);
  if (count <= 0) return MESSAGE_LIST_BODY_LINE_PX;
  const rows = Math.ceil(count / MESSAGE_LIST_EMOJI_ONLY_GLYPHS_PER_ROW);
  return rows * MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX;
}

/**
 * Inline custom emoji / unicode emoji render as replaced elements (~1.15em) and can
 * need a taller line box when mixed with links on the same row.
 */
function estimateMixedInlineEmojiBodyHeightPx(body: string): number {
  const lines = body.split('\n');
  let total = 0;
  for (const segment of lines) {
    if (!segment.trim()) {
      total += MESSAGE_LIST_BODY_LINE_PX;
      continue;
    }
    const wrapLines = Math.max(
      1,
      Math.ceil(segment.length / MESSAGE_LIST_CHARS_PER_LINE),
    );
    const hasInlineEmoji =
      /<a?:[^:>]+:\d+>/.test(segment) ||
      /\p{Extended_Pictographic}/u.test(segment);
    const linePx = hasInlineEmoji
      ? Math.max(MESSAGE_LIST_BODY_LINE_PX, 26)
      : MESSAGE_LIST_BODY_LINE_PX;
    total += wrapLines * linePx;
  }
  return Math.max(MESSAGE_LIST_BODY_LINE_PX, total);
}

/** Extra height for KaTeX regions the plain-text line estimator cannot see. */
export function estimateMessageMathExtraHeightPx(body: string): number {
  if (!body.trim()) return 0;
  const { regions } = extractMarkdownMathRegions(body);
  if (regions.length === 0) return 0;
  let extra = 0;
  for (const region of regions) {
    extra += region.displayMode
      ? MESSAGE_LIST_DISPLAY_MATH_BLOCK_FLOOR_PX
      : MESSAGE_LIST_INLINE_MATH_EXTRA_PX;
  }
  return extra;
}

/** Pre-measure body height before DOM exists — emoji-aware variant of line counting. */
export function estimateMessageBodyHeightPx(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return MESSAGE_LIST_BODY_LINE_PX;
  const mathExtra = estimateMessageMathExtraHeightPx(trimmed);
  if (isEmojiOnlyUpTo12(trimmed)) {
    return estimateEmojiOnlyBodyHeightPx(trimmed) + mathExtra;
  }
  const renderedLines = Math.min(
    MESSAGE_LIST_MAX_BODY_LINES,
    estimateRenderedBodyLines(trimmed),
  );
  const charLinesHeight = renderedLines * MESSAGE_LIST_BODY_LINE_PX;
  const inlineEmojiHeight = estimateMixedInlineEmojiBodyHeightPx(trimmed);
  return Math.max(charLinesHeight, inlineEmojiHeight) + mathExtra;
}

export function emojiBodyGeometryFingerprint(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '0';
  const { regions } = extractMarkdownMathRegions(trimmed);
  const displayMath = regions.filter((r) => r.displayMode).length;
  const inlineMath = regions.length - displayMath;
  return [
    isEmojiOnlyUpTo12(trimmed) ? 1 : 0,
    countEmojiLikeGraphemes(trimmed),
    countCustomEmojiTokens(trimmed),
    displayMath,
    inlineMath,
  ].join(':');
}
