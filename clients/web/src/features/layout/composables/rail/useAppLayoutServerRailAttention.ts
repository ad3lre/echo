import { computed, type Ref } from 'vue';
import { postEchoLeaveServer } from '@/api/echoClient';
import { getChannelDisplayName } from '@/assets/icons';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import { createChatSoundMemberRoleIdsGetter } from '@/features/layout/createChatSoundMemberRoleIdsGetter';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { useAppLayoutChatSound } from '../messaging/useAppLayoutChatSound';
import { useAppLayoutLeaveServerModal } from '../server/useAppLayoutLeaveServerModal';
import { useAppLayoutMarkRead } from '../server/useAppLayoutMarkRead';
import { useAppLayoutServerNotifications } from '../server/useAppLayoutServerNotifications';
import { useAppLayoutServerPingIndicators } from '../server/useAppLayoutServerPingIndicators';
import { useAppLayoutServerRailActions } from './useAppLayoutServerRailActions';
import { useServerNotificationLevelsMapComputed } from '../server/useServerNotificationLevelsMapComputed';
import {
  createAppLayoutIsViewingConversationChannel,
  createAppLayoutOpenConversationChannel,
} from '../dm/useAppLayoutToastDmNavigation';

type MarkReadDeps = Parameters<typeof useAppLayoutMarkRead>[0];
type PingDeps = Parameters<typeof useAppLayoutServerPingIndicators>[0];
type ChatSoundDeps = Parameters<typeof useAppLayoutChatSound>[0];
type OpenConvDeps = Parameters<
  typeof createAppLayoutOpenConversationChannel
>[0];
type RailActionsDeps = Parameters<typeof useAppLayoutServerRailActions>[0];
type MarkEchoChannelAsRead = ReturnType<
  typeof useAppLayoutMarkRead
>['markEchoChannelAsRead'];
type MarkServerAsReadForRail = ReturnType<
  typeof useAppLayoutMarkRead
>['markServerAsReadForRail'];

export type UseAppLayoutServerRailAttentionDeps = {
  workspace: MarkReadDeps['workspace'];
  selectedServerEcho: Parameters<typeof useAppLayoutServerNotifications>[1];
  serverStore: MarkReadDeps['serverStore'];
  serverAttentionByServerId: PingDeps['serverAttentionByServerId'];
  channelAttentionByChannelId: PingDeps['channelAttentionByChannelId'];
  readStateByChannelId: PingDeps['readStateByChannelId'];
  serverNotificationLevelByServerId: PingDeps['serverNotificationLevelByServerId'];
  currentUserIdForSocket: { readonly value: string | undefined };
  echoMemberRoleIdsByUser: {
    readonly value: Readonly<Record<string, readonly string[] | undefined>>;
  };
  authSession: MarkReadDeps['authSession'];
  echoAttention: MarkReadDeps['echoAttention'];
  activeChannelId: MarkReadDeps['activeChannelId'];
  echoDmPeerByChannelId: OpenConvDeps['echoDmPeerByChannelId'];
  currentUser: RailActionsDeps['currentUser'];
  currentUserComputed: ChatSoundDeps['currentUser'];
  selectedServerIdRef: ChatSoundDeps['selectedServerId'];
  isKnownDmChannelId: OpenConvDeps['isKnownDmChannelId'];
  groupDMs: OpenConvDeps['groupDMs'];
  findChannelContextById: OpenConvDeps['findChannelContextById'];
  echoDmThreadIds: OpenConvDeps['echoDmThreadIds'];
  dmAttentionByChannelId: OpenConvDeps['dmAttentionByChannelId'];
  selectedDMUserId: OpenConvDeps['selectedDMUserId'];
  handleActiveChannelChangeNavigation: OpenConvDeps['handleActiveChannelChangeNavigation'];
  selectDMTab: OpenConvDeps['selectDMTab'];
  hiddenDmInboxStore: OpenConvDeps['hiddenDmInboxStore'];
  isDmUiContext: { readonly value: boolean };
  devModeIdsEnabled: RailActionsDeps['devModeIdsEnabled'];
  canOpenServerSettings: RailActionsDeps['canOpenServerSettings'];
  canOpenServerSettingsForServer: RailActionsDeps['canOpenServerSettingsForServer'];
  canOpenInviteForServer: RailActionsDeps['canOpenInviteForServer'];
  openServerSurface: RailActionsDeps['openServerSurface'];
  isServerSettingsModalOpen: RailActionsDeps['isServerSettingsModalOpen'];
  isInviteModalOpen: RailActionsDeps['isInviteModalOpen'];
  isMoreServersPinned: RailActionsDeps['isMoreServersPinned'];
  isMoreServersPanelOpen: RailActionsDeps['isMoreServersPanelOpen'];
  inviteModalVoiceChannelId: Ref<string | null>;
  inviteModalVoiceChannelName: Ref<string | null>;
};

function useChannelDisplayNameByChannelId(workspace: WorkspaceStateApi) {
  return computed(() => {
    const map: Record<string, string> = {};
    for (const categories of Object.values(
      workspace.categoriesByServer.value,
    )) {
      for (const cat of categories) {
        for (const ch of cat.channels) {
          map[ch.id] = getChannelDisplayName(ch.name ?? '') || 'Channel';
        }
      }
    }
    return map;
  });
}

function wireNotificationsAndPings(deps: UseAppLayoutServerRailAttentionDeps) {
  const notifications = useAppLayoutServerNotifications(
    deps.workspace,
    deps.selectedServerEcho,
  );
  const serverNotificationLevelsMap = useServerNotificationLevelsMapComputed({
    servers: () => deps.serverStore.servers,
    getServerNotificationLevel: (id) =>
      deps.workspace.getServerNotificationLevel(id),
  });
  const channelDisplayNameByChannelId = useChannelDisplayNameByChannelId(
    deps.workspace,
  );
  const pings = useAppLayoutServerPingIndicators({
    serverAttentionByServerId: deps.serverAttentionByServerId,
    channelAttentionByChannelId: deps.channelAttentionByChannelId,
    readStateByChannelId: deps.readStateByChannelId,
    serverNotificationLevelByServerId: deps.serverNotificationLevelByServerId,
    channelDisplayNameByChannelId,
  });
  return {
    ...notifications,
    serverNotificationLevelsMap,
    channelDisplayNameByChannelId,
    ...pings,
  };
}

function resolveDmToastLabel(
  deps: UseAppLayoutServerRailAttentionDeps,
  cid: string,
): string {
  const peer = deps.echoDmPeerByChannelId.value.get(cid);
  if (peer) {
    const u = deps.workspace.users.value.find((x) => x.id === peer);
    if (u?.name?.trim()) return u.name.trim();
    return 'Direct message';
  }
  const g = deps.groupDMs.value[cid];
  if (g?.name?.trim()) return g.name.trim();
  return 'Group DM';
}

function createChannelToastLabelResolver(
  deps: UseAppLayoutServerRailAttentionDeps,
) {
  return (channelId: string) => {
    const cid = channelId.trim();
    if (!cid) return 'Message';
    if (deps.isKnownDmChannelId(cid)) return resolveDmToastLabel(deps, cid);
    const ctx = deps.findChannelContextById(cid);
    const rawName = ctx?.channel?.name?.trim();
    return rawName ? getChannelDisplayName(rawName) : 'Channel';
  };
}

function createAuthorToastTitleResolver(
  deps: UseAppLayoutServerRailAttentionDeps,
) {
  return (authorId: string) => {
    const id = authorId.trim();
    if (!id) return 'Someone';
    const u = deps.workspace.users.value.find((x) => x.id === id);
    return u?.name?.trim() || 'Someone';
  };
}

function wireMarkRead(deps: UseAppLayoutServerRailAttentionDeps) {
  return useAppLayoutMarkRead({
    authSession: deps.authSession,
    echoAttention: deps.echoAttention,
    workspace: deps.workspace,
    serverStore: deps.serverStore,
    activeChannelId: deps.activeChannelId,
    echoDmPeerByChannelId: deps.echoDmPeerByChannelId,
  });
}

function wireChatSound(
  deps: UseAppLayoutServerRailAttentionDeps,
  markEchoChannelAsRead: MarkEchoChannelAsRead,
  serverNotificationLevelsMap: ReturnType<
    typeof useServerNotificationLevelsMapComputed
  >,
) {
  const getChatSoundMemberRoleIds = createChatSoundMemberRoleIdsGetter({
    currentUserId: deps.currentUserIdForSocket,
    echoMemberRoleIdsByUser: () => deps.echoMemberRoleIdsByUser.value,
  });
  useAppLayoutChatSound({
    activeChannelId: deps.activeChannelId,
    currentUser: deps.currentUserComputed,
    selectedServerId: deps.selectedServerIdRef,
    serverNotificationLevelsMap,
    memberRoleIds: getChatSoundMemberRoleIds,
    isDmChannel: deps.isKnownDmChannelId,
    resolveChannelToastLabel: createChannelToastLabelResolver(deps),
    resolveAuthorToastTitle: createAuthorToastTitleResolver(deps),
    isViewingConversationChannel: createAppLayoutIsViewingConversationChannel({
      activeChannelId: deps.activeChannelId,
      echoDmPeerByChannelId: deps.echoDmPeerByChannelId,
      groupDMs: deps.groupDMs,
    }),
    isInDmUiContext: () => deps.isDmUiContext.value,
    openConversationChannel: createAppLayoutOpenConversationChannel({
      echoDmThreadIds: deps.echoDmThreadIds,
      echoDmPeerByChannelId: deps.echoDmPeerByChannelId,
      groupDMs: deps.groupDMs,
      dmAttentionByChannelId: deps.dmAttentionByChannelId,
      activeChannelId: deps.activeChannelId,
      selectedDMUserId: deps.selectedDMUserId,
      currentUserId: () => deps.currentUser.value?.id,
      isKnownDmChannelId: deps.isKnownDmChannelId,
      findChannelContextById: deps.findChannelContextById,
      handleActiveChannelChangeNavigation:
        deps.handleActiveChannelChangeNavigation,
      selectDMTab: deps.selectDMTab,
      markEchoChannelAsRead,
      hiddenDmInboxStore: deps.hiddenDmInboxStore,
    }),
  });
  return { getChatSoundMemberRoleIds };
}

function createLeaveServerOp(deps: UseAppLayoutServerRailAttentionDeps) {
  return async (sid: string, uid?: string) => {
    if (!deps.authSession.isAuthenticated) {
      dispatchAppToast('Sign in to leave a server.', 'info');
      throw new Error('no_session');
    }
    try {
      await postEchoLeaveServer(null, sid);
    } catch (e) {
      reportPrimaryFlowFailure('leave_server_failed', e, undefined, {
        showBanner: false,
      });
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not leave server.',
        'warning',
      );
      throw e;
    }
    deps.serverStore.leaveServer(sid, uid, { afterApiLeave: true });
  };
}

function wireLeaveServerAndRail(
  deps: UseAppLayoutServerRailAttentionDeps,
  markServerAsReadForRail: MarkServerAsReadForRail,
  isServerNotificationSettingsOpen: Ref<boolean>,
) {
  const leave = useAppLayoutLeaveServerModal({
    leaveServer: createLeaveServerOp(deps),
    currentUserId: () => deps.currentUser.value?.id,
  });
  const rail = useAppLayoutServerRailActions({
    serverStore: deps.serverStore,
    currentUser: deps.currentUser,
    devModeIdsEnabled: deps.devModeIdsEnabled,
    canOpenServerSettings: deps.canOpenServerSettings,
    canOpenServerSettingsForServer: deps.canOpenServerSettingsForServer,
    canOpenInviteForServer: deps.canOpenInviteForServer,
    openServerSurface: (serverId) => deps.openServerSurface(serverId),
    isServerSettingsModalOpen: deps.isServerSettingsModalOpen,
    isInviteModalOpen: deps.isInviteModalOpen,
    isServerNotificationSettingsOpen,
    isMoreServersPinned: deps.isMoreServersPinned,
    isMoreServersPanelOpen: deps.isMoreServersPanelOpen,
    clearInviteVoiceContext: () => {
      deps.inviteModalVoiceChannelId.value = null;
      deps.inviteModalVoiceChannelName.value = null;
    },
    markServerAsRead: markServerAsReadForRail,
    openLeaveServerOwnerBlockedModal: leave.openLeaveServerOwnerBlockedModal,
    openLeaveServerConfirmModal: leave.openLeaveServerConfirmModal,
  });
  return {
    isLeaveServerModalOpenRef: leave.isLeaveServerModalOpen,
    leaveServerModalServerNameRef: leave.leaveServerModalServerName,
    leaveServerModalVariantRef: leave.leaveServerModalVariant,
    openLeaveServerOwnerBlockedModal: leave.openLeaveServerOwnerBlockedModal,
    openLeaveServerConfirmModal: leave.openLeaveServerConfirmModal,
    onLeaveServerModalUpdate: leave.onLeaveServerModalUpdate,
    confirmLeaveServerFromModal: leave.confirmLeaveServerFromModal,
    handleServerRailSettings: rail.handleServerRailSettings,
    handleServerRailInvite: rail.handleServerRailInvite,
    handleServerRailNotificationSettings:
      rail.handleServerRailNotificationSettings,
    handleServerRailMarkRead: rail.handleServerRailMarkRead,
    handleServerRailLeave: rail.handleServerRailLeave,
    openServerFromMore: rail.openServerFromMore,
  };
}

/**
 * Server-rail attention: notifications, pings, mark-read, chat sound, leave.
 * Call once after guild moderation is available.
 */
export function useAppLayoutServerRailAttention(
  deps: UseAppLayoutServerRailAttentionDeps,
) {
  const notificationsAndPings = wireNotificationsAndPings(deps);
  const markRead = wireMarkRead(deps);
  const chatSound = wireChatSound(
    deps,
    markRead.markEchoChannelAsRead,
    notificationsAndPings.serverNotificationLevelsMap,
  );
  const leaveAndRail = wireLeaveServerAndRail(
    deps,
    markRead.markServerAsReadForRail,
    notificationsAndPings.isServerNotificationSettingsOpen,
  );
  return {
    ...notificationsAndPings,
    ...markRead,
    ...chatSound,
    ...leaveAndRail,
  };
}
