import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

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
  | 'showNsfwChatGate'
  | 'acknowledgeNsfwChannel'
  | 'declineNsfwGate'
  | 'mainContentColumns'
  | 'mainContentColumnsEffective'
  | 'addServerInitialView'
  | 'addServerJoinError'
  | 'addServerCreateBusy'
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
