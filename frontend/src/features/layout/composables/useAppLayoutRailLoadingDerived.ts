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

  /**
   * First app boot, before the workspace's initial load has settled. The latch is
   * one-way (flips true on the first terminal settle and never resets), so this is
   * only ever true during the very first hydrate — never on later channel switches.
   *
   * During this window the active channel may not be resolved yet (URL/nav restore
   * runs a tick after mount) and its history page has not landed, so the message
   * surface would otherwise flash empty-state copy ("No messages here yet") before
   * the per-channel `initialLoading` skeleton kicks in. We report loading for an
   * empty/unresolved surface so MessageList shows message-shaped skeletons from the
   * first frame instead. A channel that is already warm (messages cached) is left
   * untouched, so a ready chat still paints instantly.
   */
  const isBootInitialLoadSettling = computed(
    () => !opts.workspace.initialLoadSettled.value,
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
    // Boot window: skeleton an empty/unresolved message surface (any rail) so the
    // empty-state copy never flashes before the channel + its history resolve.
    if (isBootInitialLoadSettling.value) {
      const bootCid = opts.activeChannelId.value.trim();
      if (!bootCid) return true;
      if ((opts.workspace.messages.value[bootCid]?.length ?? 0) === 0)
        return true;
    }
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
