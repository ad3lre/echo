import { describe, expect, it } from 'vitest';
import {
  hexToHsv,
  hexToRgb,
  hslToRgb,
  hsvToHex,
  hsvToRgb,
  parseColorInputToHsv,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  suggestLightAlternative,
} from './colorUtils';

describe('server settings color utilities', () => {
  it('converts HSV around the hue wheel with wrapping', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0]);
    expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255]);
    expect(hsvToRgb(-60, 1, 1)).toEqual([255, 0, 255]);
    expect(hsvToHex(60, 1, 1)).toBe('#FFFF00');
  });

  it('normalizes RGB and hex forms', () => {
    expect(rgbToHex(12.2, 127.5, 255)).toBe('#0C80FF');
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hexToRgb('  #1234af  ')).toEqual({ r: 18, g: 52, b: 175 });
    expect(hexToRgb('not-a-color')).toBeNull();
  });

  it('round-trips RGB through HSV and HSL primary colors', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv(0, 255, 0)).toMatchObject({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv(0, 0, 255)).toMatchObject({ h: 240, s: 1, v: 1 });
    expect(rgbToHsv(128, 128, 128)).toMatchObject({
      h: 0,
      s: 0,
      v: expect.closeTo(128 / 255, 5),
    });

    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
    expect(hslToRgb(420, 1, 0.5)).toEqual([255, 255, 0]);
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(128, 128, 128)).toEqual({ h: 0, s: 0, l: 50 });
  });

  it('suggests safe light variants from existing colors', () => {
    expect(suggestLightAlternative('invalid')).toBe('#C7D2FE');
    const suggested = suggestLightAlternative('#334155');
    expect(suggested).toMatch(/^#[0-9A-F]{6}$/);
    expect(suggested).not.toBe('#334155');
  });

  it('parses color input strings into HSV', () => {
    expect(hexToHsv('#0f0')).toMatchObject({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#xyz')).toBeNull();
    expect(parseColorInputToHsv('#0000ff')).toMatchObject({
      h: 240,
      s: 1,
      v: 1,
    });
    expect(parseColorInputToHsv('rgb(999, -20, 128)')).toMatchObject({
      h: 330,
      s: 1,
      v: 1,
    });
    expect(parseColorInputToHsv('hsl(180, 100%, 50%)')).toMatchObject({
      h: 180,
      s: 1,
      v: 1,
    });
    expect(parseColorInputToHsv('rgba(1, 2, 3, 0.5)')).toBeNull();
  });
});
