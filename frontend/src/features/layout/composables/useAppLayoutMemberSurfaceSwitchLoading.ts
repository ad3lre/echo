import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';

/** Member list empty while guild shell or rail fast-switch is still settling. */
export function useAppLayoutMemberSurfaceSwitchLoading(opts: {
  isServerRailFastSwitchPending: Ref<boolean>;
  isGuildShellSettling: Ref<boolean>;
  memberListUsers: Ref<unknown[]> | ComputedRef<unknown[]>;
}) {
  return computed(
    () =>
      (opts.isGuildShellSettling.value ||
        opts.isServerRailFastSwitchPending.value) &&
      opts.memberListUsers.value.length === 0,
  );
}
