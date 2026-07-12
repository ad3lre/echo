import { describe, expect, it } from 'vitest';
import {
  MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX,
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
});

describe('emojiBodyGeometryFingerprint', () => {
  it('changes when emoji-only mode toggles', () => {
    const emojiOnly = emojiBodyGeometryFingerprint('<:a:1>');
    const mixed = emojiBodyGeometryFingerprint('hi <:a:1>');
    expect(emojiOnly).not.toBe(mixed);
  });
});
