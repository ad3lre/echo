import { onScopeDispose, ref, watch, type Ref } from 'vue';
import type { RailTab } from '@/features/layout/mainSurface';

const DEBOUNCE_MS = 120;

/**
 * Short “fast switch” window after rail or selected-server changes on the servers rail.
 * Used to show loading chrome while channel list / first channel / messages settle.
 */
export function useImmediateShellSwitchPending(opts: {
  activeRailTab: Ref<RailTab>;
  selectedServerId: { readonly value: string | null | undefined };
}) {
  const immediateShellSwitchPending = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function bump() {
    immediateShellSwitchPending.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      immediateShellSwitchPending.value = false;
    }, DEBOUNCE_MS);
  }

  watch(
    () => opts.activeRailTab.value,
    (next, prev) => {
      if (next === prev) return;
      bump();
    },
    { flush: 'post' },
  );

  watch(
    () =>
      [opts.activeRailTab.value, opts.selectedServerId.value ?? ''] as const,
    ([rail, nextSid], [prevRail, prevSid]) => {
      if (rail !== 'servers') return;
      if (prevRail !== 'servers' || nextSid === prevSid) return;
      bump();
    },
    { flush: 'post' },
  );

  onScopeDispose(() => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  return { immediateShellSwitchPending };
}
