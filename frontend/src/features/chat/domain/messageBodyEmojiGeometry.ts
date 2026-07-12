import { countEmojiLikeGraphemes, isEmojiOnlyUpTo12 } from '@/utils/emojiUtils';

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

/** Pre-measure body height before DOM exists — emoji-aware variant of line counting. */
export function estimateMessageBodyHeightPx(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return MESSAGE_LIST_BODY_LINE_PX;
  if (isEmojiOnlyUpTo12(trimmed)) {
    return estimateEmojiOnlyBodyHeightPx(trimmed);
  }
  const renderedLines = Math.min(
    MESSAGE_LIST_MAX_BODY_LINES,
    estimateRenderedBodyLines(trimmed),
  );
  const charLinesHeight = renderedLines * MESSAGE_LIST_BODY_LINE_PX;
  const inlineEmojiHeight = estimateMixedInlineEmojiBodyHeightPx(trimmed);
  return Math.max(charLinesHeight, inlineEmojiHeight);
}

export function emojiBodyGeometryFingerprint(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '0';
  return [
    isEmojiOnlyUpTo12(trimmed) ? 1 : 0,
    countEmojiLikeGraphemes(trimmed),
    countCustomEmojiTokens(trimmed),
  ].join(':');
}
