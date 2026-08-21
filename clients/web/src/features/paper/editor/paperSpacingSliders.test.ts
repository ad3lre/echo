import { describe, expect, it } from 'vitest';
import {
  letterSpacingFromSlider,
  letterSpacingSliderValue,
  lineHeightFromSlider,
  lineHeightSliderValue,
} from '@/features/paper/editor/paperSpacingSliders';

describe('paperSpacingSliders', () => {
  it('maps letter spacing below and above normal', () => {
    expect(letterSpacingSliderValue(null)).toBe(0);
    expect(letterSpacingFromSlider(-1)).toBe('-1px');
    expect(letterSpacingFromSlider(0)).toBeNull();
    expect(letterSpacingFromSlider(2)).toBe('2px');
    expect(letterSpacingSliderValue('1px')).toBe(1);
  });

  it('maps line height below and above normal', () => {
    expect(lineHeightSliderValue(null)).toBe(1.35);
    expect(lineHeightFromSlider(0.85)).toBe('0.85');
    expect(lineHeightFromSlider(1.35)).toBeNull();
    expect(lineHeightFromSlider(2)).toBe('2');
    expect(lineHeightSliderValue('1.5')).toBe(1.5);
  });
});
