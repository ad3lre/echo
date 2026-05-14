import type { Ref } from 'vue';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';

export function useAppLayoutMemberPopoutChromeCallbacks(deps: {
  isMemberPopoutOpen: Ref<boolean>;
  memberPopoutAnchor: Ref<PopoutAnchorRect | null>;
  memberPopoutOpenRolesPanel: Ref<boolean>;
}) {
  return {
    onMemberPopoutOpenUpdate: (open: boolean) => {
      deps.isMemberPopoutOpen.value = open;
      if (!open) {
        deps.memberPopoutAnchor.value = null;
        deps.memberPopoutOpenRolesPanel.value = false;
      }
    },
  };
}
