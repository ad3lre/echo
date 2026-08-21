import type { AppLayoutControllerContext } from '../controller/appLayoutControllerTypes';

type ShellChromeSliceKeys =
  | 'ExploreView'
  | 'MORE_SERVERS_PANEL_WIDTH'
  | 'MORE_SERVERS_COMPACT_WIDTH'
  | 'DM_PANEL_WIDTH'
  | 'appGridTemplateColumns'
  | 'expandChannels'
  | 'exploreDiscoverableServers'
  | 'isExploreView'
  | 'welcomeBackExploreGate'
  | 'welcomeBackExploreMemberEmptyDirectory'
  | 'showWelcomeBackSlimBanner'
  | 'inviteLandingActive'
  | 'inviteLandingPreview'
  | 'inviteLandingLoading'
  | 'inviteLandingError'
  | 'inviteLandingPersistBeforeOAuth'
  | 'showNsfwChatGate'
  | 'acknowledgeNsfwChannel'
  | 'declineNsfwGate'
  | 'mainContentColumns'
  | 'mainContentColumnsEffective'
  | 'addServerInitialView'
  | 'addServerJoinError'
  | 'addServerCreateBusy'
  | 'addServerJoinBusy'
  | 'addServerJoinInvitePrefill'
  | 'exploreDirectoryJoinBusy'
  | 'joinEchoServerWithInviteRaw'
  | 'handleJoinWithInviteLink'
  | 'handleCreateServer'
  | 'handleJoinDiscoverableServer'
  | 'isServerEmptyOnboarding'
  | 'isJoinServerConfirmModalOpen'
  | 'joinServerConfirmPreview'
  | 'joinServerConfirmBusy'
  | 'confirmJoinServerFromModal'
  | 'onJoinServerConfirmModalUpdate'
  | 'isServerApplicationModalOpen'
  | 'serverApplicationPayload'
  | 'serverApplicationBusy'
  | 'onServerApplicationModalUpdate'
  | 'confirmServerApplicationSubmittedFromModal';

export function useAppLayoutContextShellChromeSlice(
  deps: Pick<AppLayoutControllerContext, ShellChromeSliceKeys>,
) {
  const slice: Pick<AppLayoutControllerContext, ShellChromeSliceKeys> = {
    ...deps,
  };
  return slice;
}

export type BuildAppLayoutShellChromeSliceDeps = Parameters<
  typeof useAppLayoutContextShellChromeSlice
>[0];

export function buildAppLayoutShellChromeSliceDeps(
  deps: BuildAppLayoutShellChromeSliceDeps,
): BuildAppLayoutShellChromeSliceDeps {
  return deps;
}
