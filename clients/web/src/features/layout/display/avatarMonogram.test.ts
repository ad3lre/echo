import { describe, expect, it } from 'vitest';
import { avatarInitialsFromName, avatarMonogramHue } from './avatarMonogram';

describe('avatarInitialsFromName', () => {
  it('uses first letters of two words', () => {
    expect(avatarInitialsFromName('Com Echo')).toBe('CE');
    expect(avatarInitialsFromName('Tom Creations Owner')).toBe('TC');
  });

  it('takes two letters from a single token', () => {
    expect(avatarInitialsFromName('Danny')).toBe('DA');
    expect(avatarInitialsFromName('A')).toBe('A');
  });

  it('returns ? for empty names', () => {
    expect(avatarInitialsFromName('')).toBe('?');
    expect(avatarInitialsFromName('   ')).toBe('?');
    expect(avatarInitialsFromName(null)).toBe('?');
  });
});

describe('avatarMonogramHue', () => {
  it('is stable for the same seed', () => {
    expect(avatarMonogramHue('user-1')).toBe(avatarMonogramHue('user-1'));
  });

  it('stays in 0..359', () => {
    const h = avatarMonogramHue('Com Echo');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});
