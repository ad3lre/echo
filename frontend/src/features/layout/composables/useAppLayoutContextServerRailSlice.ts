import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

type ServerRailSliceKeys =
  | 'handleServerRailInvite'
  | 'handleServerRailMarkRead'
  | 'handleServerRailLeave'
  | 'handleServerRailNotificationSettings'
  | 'handleServerRailSettings'
  | 'openServerFromMore'
  | 'openServerSettingsFromUrl'
  | 'openServerSettings'
  | 'openServerSettingsIfAllowed'
  | 'openInviteModal'
  | 'onServerSettingsModalUpdate'
  | 'onServerSettingsModalActiveSectionUpdate'
  | 'onLeaveServerModalUpdate'
  | 'confirmLeaveServerFromModal'
  | 'isLeaveServerModalOpen'
  | 'leaveServerModalServerName'
  | 'leaveServerModalVariant'
  | 'openServerNotificationSettings'
  | 'handleServerNotificationSave'
  | 'serverNotificationLevelsMap'
  | 'serverPingKindByServerId'
  | 'serverPingBubbleByServerId'
  | 'serverPingChannelDotsByServerId'
  | 'serverUnreadActivityDotByServerId'
  | 'channelMissedActivityByChannelId'
  | 'currentServerNotificationLevel'
  | 'isServerNotificationSettingsOpen'
  | 'canDeleteCurrentServer'
  | 'canOpenServerSettings'
  | 'canOpenServerSettingsForServer'
  | 'canOpenInviteForServer'
  | 'reorderVisibleServers'
  | 'syncVanityAcrossServerLists'
  | 'selectedServerId'
  | 'servers'
  | 'isServerUnread'
  | 'onOpenCreateChannel'
  | 'hasGuildChannelChrome';

export function useAppLayoutContextServerRailSlice(
  deps: Pick<AppLayoutControllerContext, ServerRailSliceKeys>,
) {
  const slice: Pick<AppLayoutControllerContext, ServerRailSliceKeys> = {
    ...deps,
  };
  return slice;
}
