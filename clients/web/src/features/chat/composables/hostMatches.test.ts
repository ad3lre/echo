import { describe, expect, it } from 'vitest';
import { hostnameMatchesSuffix, urlHostnameMatchesSuffix } from './hostMatches';

describe('hostMatches', () => {
  it('matches exact host and subdomains', () => {
    expect(hostnameMatchesSuffix('youtube.com', 'youtube.com')).toBe(true);
    expect(hostnameMatchesSuffix('www.youtube.com', 'youtube.com')).toBe(true);
    expect(hostnameMatchesSuffix('evil-youtube.com', 'youtube.com')).toBe(
      false,
    );
  });

  it('parses http(s) URLs', () => {
    expect(
      urlHostnameMatchesSuffix(
        'https://www.youtube.com/watch?v=1',
        'youtube.com',
      ),
    ).toBe(true);
    expect(urlHostnameMatchesSuffix('javascript:alert(1)', 'youtube.com')).toBe(
      false,
    );
  });
});
