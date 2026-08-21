import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';
import { useAppLayoutCallVoiceLayoutBindings } from '../voice/useAppLayoutCallVoiceLayoutBindings';
import { useDmCallWithUserIdShellLogMirror } from '../dm/useDmCallWithUserIdShellLogMirror';
import { createNavigateToChannelActiveOnly } from '../shell/createNavigateToChannelActiveOnly';
import { useEchoPresenceSync } from '@/features/layout/useEchoPresenceSync';
import { useEchoWorkspaceLifecycle } from '../workspace/useEchoWorkspaceLifecycle';
import { useAppLayoutDmThreadInboxSort } from '../dm/useAppLayoutDmThreadInboxSort';
import { createOpenEchoGroupDmOnServerInvoker } from '@/features/dm/openEchoGroupDmOnServer';
import { useAppLayoutGuestBootstrap } from '../guest/useAppLayoutGuestBootstrap';

type Phase1 = WireAppLayoutDmAndShellResult;

function wireCallVoiceLayout(phase1: Phase1) {
  const callVoiceLayout = useAppLayoutCallVoiceLayoutBindings(
    phase1.callVoice,
    {
      findChannelContextById: phase1.findChannelContextById,
      mainSurface: phase1.mainSurface,
      activeRailTab: phase1.activeRailTab,
    },
  );
  useDmCallWithUserIdShellLogMirror(
    callVoiceLayout.dmCallWithUserId,
    phase1.dmCallWithUserIdForShellLog,
  );
  return callVoiceLayout;
}

function wireEchoLifecycle(
  phase1: Phase1,
  callVoiceLayout: ReturnType<typeof wireCallVoiceLayout>,
  syncEchoPresenceFromApi: () => void | Promise<unknown>,
) {
  const echoLifecycle = useEchoWorkspaceLifecycle({
    serverStore: phase1.serverStore,
    authSession: phase1.authSession,
    workspace: phase1.workspace,
    activeChannelId: phase1.activeChannelId,
    activeRailTab: phase1.activeRailTab,
    isServerSettingsModalOpen: phase1.isServerSettingsModalOpen,
    refreshEchoRoleData: phase1.roleUi.refreshEchoRoleData,
    getFirstTextChannelId: phase1.getFirstTextChannelId,
    syncEchoPresenceFromApi,
    mergeEchoDmThreadsFromApi: phase1.mergeEchoDmThreadsFromApi,
    mergeEchoBlockedFromApi: phase1.mergeEchoBlockedFromApi,
    dmCallWithUserId: callVoiceLayout.dmCallWithUserId,
    echoDmThreadIds: phase1.echoDmThreadIds,
  });
  callVoiceLayout.assignHydrateEchoFromApi(echoLifecycle.hydrateEchoFromApi);
  useAppLayoutDmThreadInboxSort({
    authSession: phase1.authSession,
    activeRailTab: phase1.activeRailTab,
    isDMPanelOpen: phase1.isDMPanelOpen,
    dmActiveTab: phase1.dmActiveTab,
    mergeEchoDmThreadsFromApi: phase1.mergeEchoDmThreadsFromApi,
  });
  return echoLifecycle;
}

function wireGuestAndGroupDm(
  phase1: Phase1,
  hydrateEchoFromApi: () => Promise<void>,
) {
  const openGroupDmOnServerImpl = createOpenEchoGroupDmOnServerInvoker({
    getIsAuthenticated: () => phase1.authSession.isAuthenticated,
    getAccessToken: () => phase1.authSession.accessToken,
    hydrateEchoFromApi,
  });
  const guestBootstrap = useAppLayoutGuestBootstrap({
    serverStore: phase1.serverStore,
    workspace: phase1.workspace,
    authSession: phase1.authSession,
    activeRailTab: phase1.activeRailTab,
    isAuthModalOpen: phase1.isAuthModalOpen,
    hydrateEchoFromApi,
    openGuestUpgradeForDmRef: phase1.openGuestUpgradeForDmRef,
    isMoreServersPinned: phase1.isMoreServersPinned,
    isMoreServersPanelOpen: phase1.isMoreServersPanelOpen,
    isMemberPopoutOpen: phase1.isMemberPopoutOpen,
    isSelfProfilePopoutOpen: phase1.isSelfProfilePopoutOpen,
    activeChannelId: phase1.activeChannelId,
    getFirstTextChannelId: phase1.getFirstTextChannelId,
    echoDmThreadIds: phase1.echoDmThreadIds,
    dmCallWithUserId: phase1.dmCallWithUserIdForShellLog,
    openAuthModal: phase1.openAuthModal,
  });
  return { openGroupDmOnServerImpl, guestBootstrap };
}

/**
 * Call-voice layout bindings, workspace hydrate, guest bootstrap.
 * Wiring-order: `useDmCallWithUserIdShellLogMirror`, `useEchoWorkspaceLifecycle`,
 * `assignHydrateEchoFromApi`.
 */
export function useAppLayoutVoiceAndRealtimeLifecycle(phase1: Phase1) {
  const callVoiceLayout = wireCallVoiceLayout(phase1);
  const { syncEchoPresenceFromApi, applyEchoPresenceFromSocket } =
    useEchoPresenceSync({
      serverStore: phase1.serverStore,
      authSession: phase1.authSession,
      workspace: phase1.workspace,
      workspaceMembersByServer: phase1.workspaceMembersByServer,
    });
  const echoLifecycle = wireEchoLifecycle(
    phase1,
    callVoiceLayout,
    syncEchoPresenceFromApi,
  );
  const { openGroupDmOnServerImpl, guestBootstrap } = wireGuestAndGroupDm(
    phase1,
    echoLifecycle.hydrateEchoFromApi,
  );
  const handleGoToChannel = createNavigateToChannelActiveOnly(
    phase1.activeChannelId,
  );
  return {
    callVoiceLayout,
    guestBootstrap,
    echoLifecycle,
    handleGoToChannel,
    syncEchoPresenceFromApi,
    applyEchoPresenceFromSocket,
    hydrateEchoFromApi: echoLifecycle.hydrateEchoFromApi,
    refreshEchoSocialFromApi: echoLifecycle.refreshEchoSocialFromApi,
    handleServerDeleted: echoLifecycle.handleServerDeleted,
    echoWorkspaceError: echoLifecycle.echoWorkspaceError,
    openGroupDmOnServerImpl,
    expose: {
      ...callVoiceLayout,
      ...guestBootstrap,
      echoLifecycle,
      handleGoToChannel,
      syncEchoPresenceFromApi,
      applyEchoPresenceFromSocket,
      hydrateEchoFromApi: echoLifecycle.hydrateEchoFromApi,
      refreshEchoSocialFromApi: echoLifecycle.refreshEchoSocialFromApi,
      handleServerDeleted: echoLifecycle.handleServerDeleted,
      echoWorkspaceError: echoLifecycle.echoWorkspaceError,
      openGroupDmOnServerImpl,
    },
  };
}

export type AppLayoutVoiceAndRealtimeLifecycle = ReturnType<
  typeof useAppLayoutVoiceAndRealtimeLifecycle
>;
