import { computed, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { RailTab } from '@/features/layout/mainSurface';
import { isGuildShellSettling } from '@/features/layout/composables/guildShellSettling';

/**
 * Loading hints while the servers rail switches guild or the first channel/messages hydrate.
 */
export function useAppLayoutRailLoadingDerived(opts: {
  immediateShellSwitchPending: Ref<boolean>;
  activeRailTab: Ref<RailTab>;
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  activeChannelId: Ref<string>;
  /** Empty workspace that contradicts client persistence — show loading while recovering. */
  suspiciousEmptyWorkspace?: Ref<boolean>;
}) {
  const isServerRailFastSwitchPending = computed(() => {
    const sid = opts.serverStore.selectedServerId;
    return (
      opts.immediateShellSwitchPending.value &&
      opts.activeRailTab.value === 'servers' &&
      !!sid &&
      sid !== 'echo'
    );
  });

  /**
   * Cold-start skeleton: the optimistic 'servers' rail is showing but the
   * authoritative workspace fetch has not landed yet (`loading` true, `fromApi`
   * still false). There is no switch event to drive `isServerRailFastSwitchPending`
   * on first load, so the channel panel would otherwise render blank.
   */
  const isSuspiciousEmptyWorkspaceLoading = computed(
    () =>
      !!opts.suspiciousEmptyWorkspace?.value &&
      opts.activeRailTab.value === 'servers',
  );

  const isInitialWorkspaceLoading = computed(
    () =>
      isSuspiciousEmptyWorkspaceLoading.value ||
      (opts.workspace.loading.value &&
        !opts.workspace.fromApi.value &&
        opts.activeRailTab.value === 'servers'),
  );

  const isGuildShellSettlingRef = computed(() =>
    isGuildShellSettling({
      rail: opts.activeRailTab.value,
      selectedServerId: opts.serverStore.selectedServerId,
      activeChannelId: opts.activeChannelId.value,
      categoriesByServer: opts.workspace.categoriesByServer.value,
      workspaceLoading: opts.workspace.loading.value,
      workspaceFromApi: opts.workspace.fromApi.value,
      initialLoadInFlight: opts.workspace.initialLoadInFlight.value,
    }),
  );

  const isChannelPanelSwitchLoading = computed(() => {
    if (isInitialWorkspaceLoading.value) return true;
    if (isGuildShellSettlingRef.value) return true;
    if (!isServerRailFastSwitchPending.value) return false;
    const sid = opts.serverStore.selectedServerId;
    if (!sid || sid === 'echo') return false;
    const cats = opts.workspace.categoriesByServer.value[sid] ?? [];
    return cats.length === 0 || opts.activeChannelId.value.trim().length === 0;
  });

  const isMessageSurfaceSwitchLoading = computed(() => {
    if (isInitialWorkspaceLoading.value) return true;
    if (isGuildShellSettlingRef.value) return true;
    if (!isServerRailFastSwitchPending.value) return false;
    const cid = opts.activeChannelId.value.trim();
    if (!cid) return true;
    return (opts.workspace.messages.value[cid]?.length ?? 0) === 0;
  });

  return {
    isServerRailFastSwitchPending,
    isInitialWorkspaceLoading,
    isSuspiciousEmptyWorkspaceLoading,
    isGuildShellSettling: isGuildShellSettlingRef,
    isChannelPanelSwitchLoading,
    isMessageSurfaceSwitchLoading,
  };
}
