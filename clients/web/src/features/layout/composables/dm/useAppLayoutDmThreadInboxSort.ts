import { watch, type Ref } from 'vue';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { fetchEchoDmThreads } from '@/api/echoClient';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';

export function useAppLayoutDmThreadInboxSort(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  activeRailTab: Ref<string>;
  isDMPanelOpen: Ref<boolean>;
  dmActiveTab: Ref<string>;
  mergeEchoDmThreadsFromApi: (
    threads: import('@shared/types').EchoDmRealtimeThread[],
  ) => void;
}): { refreshEchoDmThreadsForInboxSort: () => Promise<void> } {
  let dmThreadsRefreshInFlight: Promise<void> | null = null;

  async function refreshEchoDmThreadsForInboxSort(): Promise<void> {
    if (dmThreadsRefreshInFlight) return dmThreadsRefreshInFlight;
    const token = deps.authSession.accessToken?.trim() ?? '';
    if (!deps.authSession.isAuthenticated) return;
    dmThreadsRefreshInFlight = (async () => {
      try {
        const { threads } = await fetchEchoDmThreads(token);
        deps.mergeEchoDmThreadsFromApi(threads);
      } catch (e) {
        reportPrimaryFlowFailure('dm_threads.refresh_for_inbox_sort', e, {
          inDmRail: deps.activeRailTab.value === 'dm',
          dmPanelOpen: deps.isDMPanelOpen.value,
          dmSubView: deps.dmActiveTab.value,
        });
      }
    })().finally(() => {
      dmThreadsRefreshInFlight = null;
    });
    return dmThreadsRefreshInFlight;
  }

  watch(
    () =>
      [
        deps.activeRailTab.value,
        deps.isDMPanelOpen.value,
        deps.dmActiveTab.value,
        deps.authSession.backendUser?.id ?? null,
      ] as const,
    ([rail, dmOpen, subView]) => {
      if (subView !== 'messages') return;
      if (rail !== 'dm' && !dmOpen) return;
      void refreshEchoDmThreadsForInboxSort();
    },
    { immediate: true },
  );

  return { refreshEchoDmThreadsForInboxSort };
}
