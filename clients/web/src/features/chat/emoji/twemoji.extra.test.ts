/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  parseSingleEmoji,
  splitTextWithEmoji,
  getTwemojiSrc,
  parseTextWithTwemoji,
} from './twemoji';

describe('twemoji utils extra', () => {
  it('parseSingleEmoji returns img tag with alt and src', () => {
    const html = parseSingleEmoji('😀');
    expect(html).toContain('class="emoji echo-emoji-inspect-target"');
    expect(html).toContain('data-echo-unicode-emoji="😀"');
    expect(html).toContain('alt="😀"');
    expect(html).toMatch(/twemoji\/[0-9a-fA-F]+\.webp/);
  });

  it('splitTextWithEmoji splits into segments', () => {
    const segs = splitTextWithEmoji('hi 😀 there 😂!');
    expect(segs.some((s) => s.type === 'emoji')).toBe(true);
    expect(segs.some((s) => s.type === 'text')).toBe(true);
  });

  it('getTwemojiSrc returns a path for emoji', () => {
    const src = getTwemojiSrc('😀');
    expect(typeof src).toBe('string');
    expect(src).toMatch(/twemoji\/[0-9a-fA-F]+\.webp/);
  });

  it('getTwemojiSrc keeps trailing fe0f for ZWJ gender sequences (bundled asset names)', () => {
    const src = getTwemojiSrc('\u{1f9d6}\u200d\u2640\uFE0F');
    expect(src).toContain('1f9d6-200d-2640-fe0f.webp');
  });

  it('getTwemojiSrc strips fe0f only for scalar + VS presentation', () => {
    const src = getTwemojiSrc('\u2764\uFE0F');
    expect(src).toMatch(/twemoji\/2764\.webp$/);
  });

  it('getTwemojiSrc resolves heavy heart exclamation sequence to bundled asset', () => {
    const src = getTwemojiSrc('\u2763\uFE0F');
    expect(src).toMatch(/twemoji\/2763\.webp$/);
  });

  it('getTwemojiSrc resolves flags without corruption', () => {
    const src = getTwemojiSrc('\u{1f1fa}\u{1f1f8}');
    expect(src).toMatch(/twemoji\/1f1fa-1f1f8\.webp$/);
  });

  it('getTwemojiSrc resolves skin-tone ZWJ sequences without splitting', () => {
    const src = getTwemojiSrc('\u{1f9d1}\u{1f3fd}\u200d\u{1f4bb}');
    expect(src).toMatch(/twemoji\/1f9d1-1f3fd-200d-1f4bb\.webp$/);
  });

  it('parseTextWithTwemoji returns html with images', () => {
    const html = parseTextWithTwemoji('A😀B');
    expect(html).toContain('<img');
    expect(html).toContain('class="emoji echo-emoji-inspect-target"');
  });

  it('splitTextWithEmoji keeps ZWJ head-shake sequence as one segment', () => {
    const zwj = '\u{1f642}\u200d\u2194\uFE0F';
    expect(splitTextWithEmoji(`hi ${zwj}`)).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'emoji', value: zwj },
    ]);
  });

  it('parseSingleEmoji maps legacy ZWJ head-shake to 1fae8 asset', () => {
    const html = parseSingleEmoji('\u{1f642}\u200d\u2194\uFE0F');
    expect((html.match(/<img\b/g) || []).length).toBe(1);
    expect(html).toMatch(/twemoji\/1fae8\.webp/);
  });

  it('parseTextWithTwemoji emits one img for ZWJ head-shake', () => {
    const html = parseTextWithTwemoji('\u{1f642}\u200d\u2194\uFE0F');
    expect((html.match(/<img\b/g) || []).length).toBe(1);
    expect(html).toMatch(/1fae8\.webp/);
  });
});
