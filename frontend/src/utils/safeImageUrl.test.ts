import { describe, expect, it } from 'vitest';
import { requiresBundledMediaFallback, safeImageUrl } from './safeImageUrl';

describe('safeImageUrl', () => {
  it('returns placeholder for nullish or empty', () => {
    const p = safeImageUrl(undefined);
    expect(p.startsWith('data:image/gif')).toBe(true);
    expect(safeImageUrl(null)).toBe(p);
    expect(safeImageUrl('')).toBe(p);
  });

  it('allows http, https, data, and root-relative URLs', () => {
    expect(safeImageUrl('https://cdn.test/x.png')).toBe(
      'https://cdn.test/x.png',
    );
    expect(safeImageUrl('http://x/y')).toBe('http://x/y');
    expect(safeImageUrl('data:image/png;base64,xx')).toBe(
      'data:image/png;base64,xx',
    );
    expect(safeImageUrl('/static/a.webp')).toBe('/static/a.webp');
  });

  it('normalizes protocol-relative URLs to https', () => {
    expect(safeImageUrl('//cdn.example/avatar.png')).toBe(
      'https://cdn.example/avatar.png',
    );
  });

  it('rejects javascript: and other schemes', () => {
    const p = safeImageUrl('javascript:alert(1)');
    expect(p.startsWith('data:image/gif')).toBe(true);
    expect(safeImageUrl('vbscript:evil')).toBe(p);
  });

  it('prefixes safe bare relative paths with / (API paths without leading slash)', () => {
    expect(safeImageUrl('media/avatars/u1.png')).toBe('/media/avatars/u1.png');
    expect(safeImageUrl('uploads/user%20a.jpg')).toBe('/uploads/user%20a.jpg');
  });

  it('rejects strings that are not safe path tokens', () => {
    const p = safeImageUrl('not a path');
    expect(p.startsWith('data:image/gif')).toBe(true);
    expect(safeImageUrl('path/with spaces')).toBe(p);
    expect(safeImageUrl('path/with<script>')).toBe(p);
  });
});

describe('requiresBundledMediaFallback', () => {
  it('is true for empty, invalid, or safeImageUrl placeholder output', () => {
    expect(requiresBundledMediaFallback(undefined)).toBe(true);
    expect(requiresBundledMediaFallback('')).toBe(true);
    expect(requiresBundledMediaFallback('not a path')).toBe(true);
    expect(requiresBundledMediaFallback(safeImageUrl(''))).toBe(true);
  });

  it('is false for normal remote or relative URLs', () => {
    expect(requiresBundledMediaFallback('https://cdn.test/x.png')).toBe(false);
    expect(requiresBundledMediaFallback('/media/a.webp')).toBe(false);
  });
});
