import { describe, expect, it } from 'vitest';
import {
  formatBioLinkDisplay,
  normalizeBioLinkHref,
  parseBioTextSegments,
  trimBioUrlTrailingPunctuation,
} from './bioLinkText';

describe('trimBioUrlTrailingPunctuation', () => {
  it('peels trailing period from URL token', () => {
    expect(trimBioUrlTrailingPunctuation('https://ex.test/page.')).toEqual({
      url: 'https://ex.test/page',
      trailing: '.',
    });
  });
});

describe('normalizeBioLinkHref', () => {
  it('accepts http and https', () => {
    expect(normalizeBioLinkHref('https://ex.test/a')).toBe('https://ex.test/a');
  });

  it('rejects non-http schemes', () => {
    expect(normalizeBioLinkHref('javascript:alert(1)')).toBeNull();
  });
});

describe('formatBioLinkDisplay', () => {
  it('omits scheme and trailing slash on root path', () => {
    expect(formatBioLinkDisplay('https://example.com/')).toBe('example.com');
  });

  it('includes path and truncates when long', () => {
    const href = `https://example.com/${'a'.repeat(80)}`;
    const display = formatBioLinkDisplay(href, 40);
    expect(display).not.toContain('https://');
    expect(display.endsWith('…')).toBe(true);
    expect(display.length).toBeLessThanOrEqual(40);
  });
});

describe('parseBioTextSegments', () => {
  it('returns plain text when no URLs', () => {
    expect(parseBioTextSegments('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('splits text around a link', () => {
    const url = 'https://echo.test/docs';
    expect(parseBioTextSegments(`see ${url} thanks`)).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'link',
        href: url,
        display: 'echo.test/docs',
        faviconDomain: 'echo.test',
      },
      { type: 'text', value: ' thanks' },
    ]);
  });

  it('keeps invalid URL tokens as text', () => {
    const token = 'https://';
    expect(parseBioTextSegments(token)).toEqual([
      { type: 'text', value: token },
    ]);
  });
});
