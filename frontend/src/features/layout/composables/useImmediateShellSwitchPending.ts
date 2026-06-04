import { onScopeDispose, ref, watch, type Ref } from 'vue';
import type { RailTab } from '@/features/layout/mainSurface';

const DEBOUNCE_MS = 120;
const MAX_PENDING_MS = 2000;

/**
 * Short “fast switch” window after rail or selected-server changes on the servers rail.
 * Used to show loading chrome while channel list / first channel / messages settle.
 */
export function useImmediateShellSwitchPending(opts: {
  activeRailTab: Ref<RailTab>;
  selectedServerId: { readonly value: string | null | undefined };
  /** When true, pending clears immediately (guild tree + channel resolved). */
  clearWhen?: Ref<boolean>;
}) {
  const immediateShellSwitchPending = ref(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  function clearPending() {
    clearTimers();
    immediateShellSwitchPending.value = false;
  }

  function bump() {
    immediateShellSwitchPending.value = true;
    if (opts.clearWhen?.value) {
      clearPending();
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (opts.clearWhen?.value) {
        clearPending();
        return;
      }
      immediateShellSwitchPending.value = false;
    }, DEBOUNCE_MS);

    if (!maxTimer) {
      maxTimer = setTimeout(() => {
        maxTimer = null;
        clearPending();
      }, MAX_PENDING_MS);
    }
  }

  if (opts.clearWhen) {
    watch(
      opts.clearWhen,
      (settled) => {
        if (settled && immediateShellSwitchPending.value) clearPending();
      },
      { flush: 'post' },
    );
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

  /** First guild selection on servers rail (bootstrap) — same chrome as a rail click. */
  watch(
    () =>
      [opts.activeRailTab.value, opts.selectedServerId.value ?? ''] as const,
    ([rail, sid], prev) => {
      if (rail !== 'servers' || !sid || sid === 'echo') return;
      const prevSid = prev?.[1] ?? '';
      if (prevSid) return;
      bump();
    },
    { flush: 'post' },
  );

  onScopeDispose(() => {
    clearTimers();
  });

  return { immediateShellSwitchPending };
}
