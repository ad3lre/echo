import { describe, expect, it } from 'vitest';
import { elementSupportsFullscreen } from './domFullscreen';

describe('elementSupportsFullscreen', () => {
  it('returns false for null', () => {
    expect(elementSupportsFullscreen(null)).toBe(false);
  });

  it('returns true when requestFullscreen exists', () => {
    const el = {
      requestFullscreen: () => Promise.resolve(),
    } as unknown as HTMLElement;
    expect(elementSupportsFullscreen(el)).toBe(true);
  });
});
