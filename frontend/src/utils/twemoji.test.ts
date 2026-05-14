import { describe, expect, it } from 'vitest';
import { splitTextWithEmoji, twemojiOpts } from './twemoji';

describe('splitTextWithEmoji', () => {
  it('returns single text segment when no emoji', () => {
    expect(splitTextWithEmoji('hello')).toEqual([
      { type: 'text', value: 'hello' },
    ]);
  });

  it('alternates text and emoji', () => {
    const parts = splitTextWithEmoji('a👋b');
    expect(parts).toEqual([
      { type: 'text', value: 'a' },
      { type: 'emoji', value: '👋' },
      { type: 'text', value: 'b' },
    ]);
  });
});

describe('twemojiOpts', () => {
  it('callback builds local twemoji path', () => {
    expect(twemojiOpts.callback('1f44b')).toMatch(/twemoji\/1f44b\.webp$/);
  });
});
