import { describe, expect, it } from 'vitest';
import { safeEmbedHref } from './safeEmbedHref';

describe('safeEmbedHref', () => {
  it('keeps http(s) URLs', () => {
    expect(safeEmbedHref('https://example.com/a')).toBe(
      'https://example.com/a',
    );
    expect(safeEmbedHref(' http://example.com ')).toBe('http://example.com');
  });
  it('rejects unsafe or invalid values', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
      '/relative',
      '',
      undefined,
      null,
    ]) {
      expect(safeEmbedHref(bad)).toBeUndefined();
    }
  });
});
