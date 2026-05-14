import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';

/** Member list empty while rail fast-switch pending — show loading chrome. */
export function useAppLayoutMemberSurfaceSwitchLoading(opts: {
  isServerRailFastSwitchPending: Ref<boolean>;
  memberListUsers: Ref<unknown[]> | ComputedRef<unknown[]>;
}) {
  return computed(
    () =>
      opts.isServerRailFastSwitchPending.value &&
      opts.memberListUsers.value.length === 0,
  );
}
