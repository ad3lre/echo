import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutDmPeerSelectionOpen } from './useAppLayoutDmPeerSelectionOpen';

describe('useAppLayoutDmPeerSelectionOpen', () => {
  it('is true on DM rail with selected peer', () => {
    const open = useAppLayoutDmPeerSelectionOpen({
      activeRailTab: ref('dm'),
      selectedDMUserId: ref('u1'),
    });
    expect(open.value).toBe(true);
  });

  it('is false without peer', () => {
    const open = useAppLayoutDmPeerSelectionOpen({
      activeRailTab: ref('dm'),
      selectedDMUserId: ref(null),
    });
    expect(open.value).toBe(false);
  });
});
