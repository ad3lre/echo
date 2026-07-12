import { describe, expect, it } from 'vitest';
import { isEmojiOnlyUpTo12, countEmojiLikeGraphemes } from './emojiUtils';

describe('isEmojiOnlyUpTo12', () => {
  it('returns false for empty or text', () => {
    expect(isEmojiOnlyUpTo12('')).toBe(false);
    expect(isEmojiOnlyUpTo12('   ')).toBe(false);
    expect(isEmojiOnlyUpTo12('hello')).toBe(false);
    expect(isEmojiOnlyUpTo12('👋 hi')).toBe(false);
  });

  it('returns true for short emoji-only strings', () => {
    expect(isEmojiOnlyUpTo12('👋')).toBe(true);
    expect(isEmojiOnlyUpTo12('👋 🎉')).toBe(true);
  });

  it('returns false when more than 12 graphemes', () => {
    const many = Array.from({ length: 13 }, () => '😀').join('');
    expect(isEmojiOnlyUpTo12(many)).toBe(false);
  });

  it('counts emoji-like graphemes for height estimates', () => {
    expect(countEmojiLikeGraphemes('<:a:1> 👋')).toBe(2);
    expect(countEmojiLikeGraphemes('hello')).toBe(0);
  });

  it('returns true for custom emoji tokens only (1–12)', () => {
    expect(isEmojiOnlyUpTo12('<:pepe:1486467212268142592>')).toBe(true);
    expect(isEmojiOnlyUpTo12('  <:a:1>  <a:b:2>  ')).toBe(true);
  });

  it('returns true for app icon tokens only (1-12)', () => {
    expect(isEmojiOnlyUpTo12('<icon:message.svg>')).toBe(true);
    expect(isEmojiOnlyUpTo12('  <icon:message.svg>  <icon:GIF.svg>  ')).toBe(
      true,
    );
  });

  it('returns false when custom tokens mix with text', () => {
    expect(isEmojiOnlyUpTo12('hi <:a:1>')).toBe(false);
  });

  it('returns false when app icon tokens mix with text', () => {
    expect(isEmojiOnlyUpTo12('hi <icon:message.svg>')).toBe(false);
  });

  it('returns true when custom emoji + app icon tokens are the only content', () => {
    expect(isEmojiOnlyUpTo12('  <icon:message.svg>  <:a:1>  ')).toBe(true);
  });

  it('returns false for more than 12 custom emoji tokens', () => {
    const many = Array.from(
      { length: 13 },
      (_, i) => `<:e${i}:100000000000${i}>`,
    ).join(' ');
    expect(isEmojiOnlyUpTo12(many)).toBe(false);
  });

  it('returns false for more than 12 app icon tokens', () => {
    const many = Array.from({ length: 13 }, () => '<icon:message.svg>').join(
      ' ',
    );
    expect(isEmojiOnlyUpTo12(many)).toBe(false);
  });
});
