import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { PopoutAnchorRect } from '@/features/member-profile/memberProfiles';
import { createOpenMemberProfileWithRolesPref } from './createOpenMemberProfileWithRolesPref';

describe('createOpenMemberProfileWithRolesPref', () => {
  it('sets roles panel flag then delegates', () => {
    const memberPopoutOpenRolesPanel = ref(false);
    const openMemberProfile = vi.fn();
    const anchor: PopoutAnchorRect = {
      top: 0,
      left: 0,
      right: 1,
      bottom: 1,
      width: 1,
      height: 1,
      source: 'member-list',
    };
    const open = createOpenMemberProfileWithRolesPref({
      memberPopoutOpenRolesPanel,
      openMemberProfile,
    });
    open('u1', anchor, { rolesPanel: true });
    expect(memberPopoutOpenRolesPanel.value).toBe(true);
    expect(openMemberProfile).toHaveBeenCalledWith('u1', anchor);
  });
});
