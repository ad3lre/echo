import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import { useAppLayoutMemberPopoutChromeCallbacks } from './useAppLayoutMemberPopoutChromeCallbacks';

function sampleAnchor(): PopoutAnchorRect {
  return {
    top: 0,
    left: 0,
    right: 1,
    bottom: 1,
    width: 1,
    height: 1,
    source: 'generic',
  };
}

describe('useAppLayoutMemberPopoutChromeCallbacks', () => {
  it('closes popout clears anchor and roles panel', () => {
    const isMemberPopoutOpen = ref(true);
    const memberPopoutAnchor = ref<PopoutAnchorRect | null>(sampleAnchor());
    const memberPopoutOpenRolesPanel = ref(true);
    const c = useAppLayoutMemberPopoutChromeCallbacks({
      isMemberPopoutOpen,
      memberPopoutAnchor,
      memberPopoutOpenRolesPanel,
    });
    c.onMemberPopoutOpenUpdate(false);
    expect(isMemberPopoutOpen.value).toBe(false);
    expect(memberPopoutAnchor.value).toBeNull();
    expect(memberPopoutOpenRolesPanel.value).toBe(false);
  });

  it('open true only sets flag', () => {
    const anchor = sampleAnchor();
    const isMemberPopoutOpen = ref(false);
    const memberPopoutAnchor = ref<PopoutAnchorRect | null>(anchor);
    const memberPopoutOpenRolesPanel = ref(false);
    const c = useAppLayoutMemberPopoutChromeCallbacks({
      isMemberPopoutOpen,
      memberPopoutAnchor,
      memberPopoutOpenRolesPanel,
    });
    c.onMemberPopoutOpenUpdate(true);
    expect(isMemberPopoutOpen.value).toBe(true);
    expect(memberPopoutAnchor.value).toEqual(anchor);
  });
});
