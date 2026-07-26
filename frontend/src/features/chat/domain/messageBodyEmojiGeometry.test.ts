import { describe, expect, it } from 'vitest';
import {
  MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX,
  MESSAGE_LIST_BODY_LINE_PX,
  MESSAGE_LIST_DISPLAY_MATH_BLOCK_FLOOR_PX,
  estimateMessageBodyHeightPx,
  emojiBodyGeometryFingerprint,
} from '@/features/chat/domain/messageBodyEmojiGeometry';

describe('estimateMessageBodyHeightPx', () => {
  it('reserves 48px rows for emoji-only custom emoji tokens', () => {
    const height = estimateMessageBodyHeightPx('<:pepe:1486467212268142592>');
    expect(height).toBe(MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX);
  });

  it('reserves 48px rows for emoji-only unicode emoji', () => {
    const height = estimateMessageBodyHeightPx('👋 🎉');
    expect(height).toBe(MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX);
  });

  it('uses taller line boxes when inline emoji mix with text', () => {
    const plain = estimateMessageBodyHeightPx('hello world');
    const mixed = estimateMessageBodyHeightPx('hello 👋 https://example.com');
    expect(mixed).toBeGreaterThanOrEqual(plain);
  });

  it('adds a display-math floor so KaTeX pending slots are not tiny', () => {
    const plain = estimateMessageBodyHeightPx('hello');
    const withMath = estimateMessageBodyHeightPx(
      '$$\\begin{matrix}1&2\\\\3&4\\end{matrix}$$',
    );
    expect(withMath - plain).toBeGreaterThanOrEqual(
      MESSAGE_LIST_DISPLAY_MATH_BLOCK_FLOOR_PX - MESSAGE_LIST_BODY_LINE_PX,
    );
  });
});

describe('emojiBodyGeometryFingerprint', () => {
  it('changes when emoji-only mode toggles', () => {
    const emojiOnly = emojiBodyGeometryFingerprint('<:a:1>');
    const mixed = emojiBodyGeometryFingerprint('hi <:a:1>');
    expect(emojiOnly).not.toBe(mixed);
  });

  it('changes when display math is present', () => {
    const plain = emojiBodyGeometryFingerprint('hello');
    const withMath = emojiBodyGeometryFingerprint('$$x^2$$');
    expect(withMath).not.toBe(plain);
  });
});
