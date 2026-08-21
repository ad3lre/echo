import { describe, expect, it } from 'vitest';
import {
  AVATAR_BACKGROUND_PALETTE,
  avatarBackgroundFromDisplayName,
  dominantLettersFromDisplayName,
  generateDefaultAvatarPfp,
} from '../../auth/defaultAvatarPfp';

describe('dominantLettersFromDisplayName', () => {
  it('uses first and last word initials', () => {
    expect(dominantLettersFromDisplayName('Ada Lovelace')).toBe('AL');
    expect(dominantLettersFromDisplayName('  Jean   Luc Picard  ')).toBe('JP');
  });

  it('uses first two letters for a single word', () => {
    expect(dominantLettersFromDisplayName('echo')).toBe('EC');
    expect(dominantLettersFromDisplayName('X')).toBe('XX');
  });

  it('handles empty input', () => {
    expect(dominantLettersFromDisplayName('')).toBe('?');
    expect(dominantLettersFromDisplayName('   ')).toBe('?');
  });
});

describe('avatarBackgroundFromDisplayName', () => {
  it('returns a palette color deterministically', () => {
    expect(avatarBackgroundFromDisplayName('Ada Lovelace')).toBe(
      avatarBackgroundFromDisplayName('Ada Lovelace'),
    );
    expect(avatarBackgroundFromDisplayName('Ada Lovelace')).toBe(
      avatarBackgroundFromDisplayName('ada lovelace'),
    );
    expect(AVATAR_BACKGROUND_PALETTE).toContain(
      avatarBackgroundFromDisplayName('Zora'),
    );
  });
});

describe('generateDefaultAvatarPfp', () => {
  it('returns an SVG data URL with hashed palette background', () => {
    const url = generateDefaultAvatarPfp('Test User');
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
    const bg = avatarBackgroundFromDisplayName('Test User');
    expect(svg).toContain(`fill="${bg}"`);
    expect(svg).toContain('TU');
  });
});
