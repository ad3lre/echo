import { describe, expect, it } from 'vitest';
import { icons } from '@/assets/icons';
import { useServerSettingsNavigation } from './useServerSettingsNavigation';

describe('useServerSettingsNavigation', () => {
  const { getSectionIcon } = useServerSettingsNavigation();

  it('returns distinct icons for newer server settings sections', () => {
    expect(getSectionIcon('Tickets')).toBe(icons.lifeRing);
    expect(getSectionIcon('Self-assignable Roles')).toBe(icons.userTag);
    expect(getSectionIcon('Stickers')).toBe(icons.sparkle);
  });

  it('does not fall back to generic more icon for known sections', () => {
    expect(getSectionIcon('Tickets')).not.toBe(icons.more);
    expect(getSectionIcon('Self-assignable Roles')).not.toBe(icons.more);
    expect(getSectionIcon('Stickers')).not.toBe(icons.more);
  });
});
