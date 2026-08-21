import { describe, expect, it } from 'vitest';
import { expandedProfileHidesOpenDmButton } from './useAppLayoutMessagingSurfaceAdapters';

describe('expandedProfileHidesOpenDmButton', () => {
  it('hides only when the expanded profile is the selected DM peer', () => {
    expect(expandedProfileHidesOpenDmButton('user-1', 'user-1')).toBe(true);
    expect(expandedProfileHidesOpenDmButton('user-1', 'user-2')).toBe(false);
    expect(expandedProfileHidesOpenDmButton(undefined, 'user-1')).toBe(false);
    expect(expandedProfileHidesOpenDmButton('  ', 'user-1')).toBe(false);
  });
});
