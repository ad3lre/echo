import { describe, expect, it } from 'vitest';
import {
  aspectRatioStyleFromDimensions,
  mediaAspectStyleFromDims,
  readAspectRatioFromStyle,
} from './chatMediaAspect';

describe('chatMediaAspect', () => {
  it('builds aspect ratio style from dimensions', () => {
    expect(aspectRatioStyleFromDimensions(1920, 1080)).toEqual({
      aspectRatio: '1920 / 1080',
    });
  });

  it('returns undefined for invalid dimensions', () => {
    expect(mediaAspectStyleFromDims({ width: 0, height: 10 })).toBeUndefined();
    expect(mediaAspectStyleFromDims(undefined)).toBeUndefined();
  });

  it('reads aspect ratio from style objects', () => {
    expect(
      readAspectRatioFromStyle({ aspectRatio: '4 / 3', width: '100%' }),
    ).toBe('4 / 3');
    expect(readAspectRatioFromStyle(undefined)).toBeNull();
  });
});
