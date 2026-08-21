import type { Ref } from 'vue';
import type { PopoutAnchorRect } from '@/features/member-profile/memberProfiles';

export function createOpenMemberProfileWithRolesPref(deps: {
  memberPopoutOpenRolesPanel: Ref<boolean>;
  openMemberProfile: (
    uid: string,
    anchorRect?: PopoutAnchorRect | null,
  ) => void;
}) {
  return (
    uid: string,
    anchor?: PopoutAnchorRect | null,
    opts?: { rolesPanel?: boolean },
  ) => {
    deps.memberPopoutOpenRolesPanel.value = !!opts?.rolesPanel;
    deps.openMemberProfile(uid, anchor);
  };
}
