import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicAssetUrl, splitTextWithEmoji, twemojiOpts } from './twemoji';

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

describe('publicAssetUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses root-absolute paths when base is relative (Tauri)', () => {
    vi.stubEnv('BASE_URL', './');
    expect(publicAssetUrl('twemoji/1f44b.webp')).toBe('/twemoji/1f44b.webp');
  });

  it('respects absolute base prefix on web', () => {
    vi.stubEnv('BASE_URL', '/app/');
    expect(publicAssetUrl('twemoji/1f44b.webp')).toBe(
      '/app/twemoji/1f44b.webp',
    );
  });
});

describe('twemojiOpts', () => {
  it('callback builds local twemoji path', () => {
    expect(twemojiOpts.callback('1f44b')).toMatch(/twemoji\/1f44b\.webp$/);
  });
});
