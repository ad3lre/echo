import { computed } from 'vue';
import { useEchoHistory } from '@/features/chat/composables/useEchoHistory';
import { useGuildChannelModals } from '../server/useGuildChannelModals';
import { useAppLayoutChannelManageCapabilities } from '../server/useAppLayoutChannelManageCapabilities';
import { useAppLayoutRailLoadingDerived } from '../rail/useAppLayoutRailLoadingDerived';
import { isGuildChannelTreeLoaded } from '../shell/guildShellSettling';
import {
  createPreserveActiveChannelOnHydrateRace,
  watchCloseSettingsModalsOnShellChange,
} from '../voice/useAppLayoutVoiceShellChannelGuards';
import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';
import type { AppLayoutVoiceAndRealtimeLifecycle } from './useAppLayoutVoiceAndRealtimeLifecycle';

type Phase1 = WireAppLayoutDmAndShellResult;

function wireChannelModals(
  phase1: Phase1,
  hydrateEchoFromApi: AppLayoutVoiceAndRealtimeLifecycle['hydrateEchoFromApi'],
) {
  const channelModals = useGuildChannelModals({
    authSession: phase1.authSession,
    workspace: phase1.workspace,
    selectedServer: phase1.selectedServerEcho,
    categoriesForServer: phase1.categoriesForServer,
    activeChannelId: phase1.activeChannelId,
    activeRailTab: phase1.activeRailTab,
    getFirstTextChannelId: phase1.getFirstTextChannelId,
    hydrateWorkspace: hydrateEchoFromApi,
  });
  watchCloseSettingsModalsOnShellChange({
    activeRailTab: phase1.activeRailTab,
    selectedServerId: phase1.serverStore,
    activeChannelId: phase1.activeChannelId,
    isSettingsModalOpen: phase1.isSettingsModalOpen,
    settingsModalInitialSection: phase1.settingsModalInitialSection,
    isServerSettingsModalOpen: phase1.isServerSettingsModalOpen,
    serverSettingsModalInitialSection: phase1.serverSettingsModalInitialSection,
  });
  return channelModals;
}

function wireChannelCapsAndHistory(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
) {
  const { canCreateChannels, canManageThisChannel } =
    useAppLayoutChannelManageCapabilities({
      selectedServerEcho: phase1.selectedServerEcho,
      isAuthenticated: () => phase1.authSession.isAuthenticated,
      echoCanCreateChannel: phase1.echoCanContext.echoCanCreateChannel,
    });
  phase1.watchActiveChannelWithServerChange(
    phase1.activeChannelId,
    createPreserveActiveChannelOnHydrateRace({
      isDmUiContext: phase1.isDmUiContext,
      isInDMMode: lifecycle.callVoiceLayout.isInDMModeComputed,
      isKnownDmChannelId: phase1.isKnownDmChannelId,
    }),
  );
  const echoChannelHistory = useEchoHistory(phase1.activeChannelId, {
    echoDmThreadIds: phase1.echoDmThreadIds,
    echoDmPeerByChannelId: phase1.echoDmPeerByChannelId,
  });
  const railLoading = useAppLayoutRailLoadingDerived({
    immediateShellSwitchPending: phase1.immediateShellSwitchPending,
    activeRailTab: phase1.activeRailTab,
    serverStore: phase1.serverStore,
    workspace: phase1.workspace,
    activeChannelId: phase1.activeChannelId,
    suspiciousEmptyWorkspace: phase1.suspiciousEmptyWorkspace,
  });
  const isChannelTreeLoadedForSelectedServer = computed(() => {
    const sid = phase1.serverStore.selectedServerId?.trim();
    if (!sid || sid === 'echo') return true;
    return isGuildChannelTreeLoaded(
      phase1.workspace.categoriesByServer.value,
      sid,
    );
  });
  return {
    canCreateChannels,
    canManageThisChannel,
    echoChannelHistory,
    ...railLoading,
    isChannelTreeLoadedForSelectedServer,
  };
}

/**
 * Channel modals, manage caps, history, rail loading.
 * Wiring-order: `useEchoHistory`, `useAppLayoutRailLoadingDerived`.
 */
export function useAppLayoutVoiceAndRealtimeChannels(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
) {
  const channelModals = wireChannelModals(phase1, lifecycle.hydrateEchoFromApi);
  const capsHistory = wireChannelCapsAndHistory(phase1, lifecycle);
  return {
    channelModals,
    ...capsHistory,
    expose: {
      channelModals,
      ...channelModals,
      ...capsHistory,
    },
  };
}

export type AppLayoutVoiceAndRealtimeChannels = ReturnType<
  typeof useAppLayoutVoiceAndRealtimeChannels
>;
