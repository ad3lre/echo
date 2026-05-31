import { describe, expect, it } from 'vitest';
import {
  isPortraitAspectRatio,
  parseAspectRatioPair,
} from './echoVideoPlayerSizing';

describe('echoVideoPlayerSizing', () => {
  describe('parseAspectRatioPair', () => {
    it('parses width / height strings', () => {
      expect(parseAspectRatioPair('1080 / 1920')).toEqual({ w: 1080, h: 1920 });
      expect(parseAspectRatioPair('1920/1080')).toEqual({ w: 1920, h: 1080 });
    });

    it('rejects invalid values', () => {
      expect(parseAspectRatioPair('')).toBeNull();
      expect(parseAspectRatioPair('1080')).toBeNull();
      expect(parseAspectRatioPair('0 / 1920')).toBeNull();
    });
  });

  describe('isPortraitAspectRatio', () => {
    it('detects portrait and landscape ratios', () => {
      expect(isPortraitAspectRatio('1080 / 1920')).toBe(true);
      expect(isPortraitAspectRatio('720 / 1280')).toBe(true);
      expect(isPortraitAspectRatio('1920 / 1080')).toBe(false);
      expect(isPortraitAspectRatio('1280 / 720')).toBe(false);
    });

    it('returns false for missing or invalid ratios', () => {
      expect(isPortraitAspectRatio(null)).toBe(false);
      expect(isPortraitAspectRatio('')).toBe(false);
      expect(isPortraitAspectRatio('bad')).toBe(false);
    });
  });
});
