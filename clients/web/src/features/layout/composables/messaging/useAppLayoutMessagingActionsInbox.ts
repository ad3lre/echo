import { usePollVotes } from '@/features/layout/composables/messaging/usePollVotes';
import { useReactionFavorites } from '@/features/chat/emoji/useReactionFavorites';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import type { WireAppLayoutVoiceAndRealtimeResult } from '../controller/wireAppLayoutVoiceAndRealtime';
import { createResolveEchoDmPeerFromMap } from '../dm/createResolveEchoDmPeerFromMap';
import { useAppLayoutMessageActions } from './useAppLayoutMessageActions';
import { useAppLayoutMentionNotifications } from './useAppLayoutMentionNotifications';
import { useAppLayoutNotificationPrefsSync } from '../controller/useAppLayoutNotificationPrefsSync';
import { useAppLayoutPresenceStatusBridge } from '../workspace/useAppLayoutPresenceStatusBridge';
import { useAppLayoutDmInboxPanel } from '../dm/useAppLayoutDmInboxPanel';
import { useAppLayoutDiscordBotPoll } from '../controller/useAppLayoutDiscordBotPoll';

type Phase2 = WireAppLayoutVoiceAndRealtimeResult;

export type UseAppLayoutMessagingActionsInboxExtras = {
  clearSearch: () => void;
};

function wireMessageActions(
  phase2: Phase2,
  extras: UseAppLayoutMessagingActionsInboxExtras,
  votePollMock: ReturnType<typeof usePollVotes>['votePoll'],
  recordReaction: ReturnType<typeof useReactionFavorites>['recordReaction'],
) {
  const resolveEchoDmPeerForMessageActions = createResolveEchoDmPeerFromMap(
    () => phase2.echoDmPeerByChannelId.value,
  );
  const messageActions = useAppLayoutMessageActions({
    activeChannelId: phase2.activeChannelId,
    currentUser: phase2.currentUserComputed,
    users: phase2.workspace.users,
    messages: phase2.workspace.messages,
    votePoll: votePollMock,
    submitEchoPollVote: phase2.submitPollVoteViaSocket,
    submitEchoMessageEdit: phase2.submitMessageEditViaSocket,
    submitEchoImageSlotFill: phase2.submitImageSlotFillViaSocket,
    submitEchoMessageDelete: phase2.submitMessageDeleteViaSocket,
    uiTransactions: phase2.uiTransactions,
    isLiveSocketReady: phase2.isLiveSocketReady,
    toggleReaction: phase2.toggleReactionOnMessages,
    recordReaction,
    clearSearch: extras.clearSearch,
    onSelectServerForChannel: phase2.selectServerViaStore,
    onOpenServerChannel: (serverId, channelId) =>
      phase2.openServerSurface(serverId, channelId),
    onSelectDmUser: phase2.selectDmUser,
    onSelectGroupDmChannel: (channelId) =>
      phase2.selectGroupDmForIncomingRail.value?.(channelId),
    resolveGuildServerIdForChannel: (channelId) =>
      resolveEchoServerIdContainingChannel(
        channelId,
        phase2.workspace.categoriesByServer.value,
      ),
    resolveEchoDmPeer: resolveEchoDmPeerForMessageActions,
    prefetchEchoMessage: phase2.echoChannelHistory?.prefetchUntilMessageVisible,
    onAfterDeleteMessage: undefined,
    getActiveChatMessageNav: () => phase2.chatMessageNavBridge.getActiveApi(),
    dmActiveTab: phase2.dmActiveTab,
    activeRailTab: phase2.activeRailTab,
  });
  phase2.wireMessageGoToMessage(messageActions.handleGoToMessage);
  return messageActions;
}

function wireMentionsAndInbox(
  phase2: Phase2,
  handleGoToMessage: ReturnType<
    typeof useAppLayoutMessageActions
  >['handleGoToMessage'],
) {
  const mentions = useAppLayoutMentionNotifications({
    findChannelContextById: phase2.findChannelContextById,
    workspace: phase2.workspace,
    echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
    echoDmThreadIds: phase2.echoDmThreadIds,
    groupDMs: phase2.groupDMs,
    currentUserIdForSocket: phase2.currentUserIdForSocket,
    authSession: phase2.authSession,
    echoAttention: phase2.echoAttention,
    serverStore: phase2.serverStore,
    activeChannelId: phase2.activeChannelId,
    handleGoToMessage,
    markEchoChannelAsRead: phase2.markEchoChannelAsRead,
  });
  useAppLayoutNotificationPrefsSync({ authSession: phase2.authSession });
  const inbox = useAppLayoutDmInboxPanel({
    activeRailTab: phase2.activeRailTab,
    isDMPanelOpen: phase2.isDMPanelOpen,
    currentUserIdForSocket: phase2.currentUserIdForSocket,
    workspace: phase2.workspace,
    groupDMs: phase2.groupDMs,
    echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId: phase2.echoDmLastActivityAtMsByChannelId,
    echoDmLastActivityIdByChannelId: phase2.echoDmLastActivityIdByChannelId,
    selectedDMUserId: phase2.selectedDMUserId,
    activeChannelId: phase2.activeChannelId,
    dmUnreadByChannelIdForPanel: phase2.dmUnreadByChannelIdForPanel,
    activeGroupDM: phase2.activeGroupDM,
    authSession: phase2.authSession,
    hiddenDmInboxStore: phase2.hiddenDmInboxStore,
    favoriteDmInboxStore: phase2.favoriteDmInboxStore,
    mergeEchoDmThread: phase2.mergeEchoDmThread,
  });
  return { mentions, inbox };
}

/**
 * Message actions, mention notifications, DM inbox, presence, Discord-bot poll.
 */
export function useAppLayoutMessagingActionsInbox(
  phase2: Phase2,
  extras: UseAppLayoutMessagingActionsInboxExtras,
) {
  const { votePoll: votePollMock } = usePollVotes(phase2.workspace.messages);
  const reactionFavorites = useReactionFavorites();
  const messageActions = wireMessageActions(
    phase2,
    extras,
    votePollMock,
    reactionFavorites.recordReaction,
  );
  const { updateStatusCast } = useAppLayoutPresenceStatusBridge({
    authSession: phase2.authSession,
    presenceByUserId: phase2.presenceByUserId,
    presenceMobileByUserId: phase2.presenceMobileByUserId,
    updateCurrentUserStatus: messageActions.updateCurrentUserStatus,
  });
  const { mentions, inbox } = wireMentionsAndInbox(
    phase2,
    messageActions.handleGoToMessage,
  );
  const { discordBotExportReadyBanner, dismissDiscordBotExportReadyBanner } =
    useAppLayoutDiscordBotPoll({
      isAuthenticated: () => phase2.authSession.isAuthenticated,
      isAddServerModalOpen: phase2.isAddServerModalOpen,
    });
  return {
    assembly: {
      reactionFavorites,
      messageActions,
      dmMentionNotifications: mentions.dmMentionNotifications,
      mentionNotificationHydrationLoading:
        mentions.mentionNotificationHydrationLoading,
      resolveDmMentionNotificationChannelLabel:
        mentions.resolveDmMentionNotificationChannelLabel,
      resolveDmMentionNotificationAuthorName:
        mentions.resolveDmMentionNotificationAuthorName,
      resolveDmMentionNotificationRowPreview:
        mentions.resolveDmMentionNotificationRowPreview,
      dmNotificationReadStateByChannelId:
        mentions.dmNotificationReadStateByChannelId,
      mentionNotificationCategoriesByServer:
        mentions.mentionNotificationCategoriesByServer,
      mentionNotificationServers: mentions.mentionNotificationServers,
      dmNotificationsReadPreset: mentions.dmNotificationsReadPreset,
      dmNotificationsSourceKey: mentions.dmNotificationsSourceKey,
      onOpenMentionNotification: mentions.onOpenMentionNotification,
      onMarkMentionNotificationRead: mentions.onMarkMentionNotificationRead,
      updateStatusCast,
      dmInboxEntriesForPanel: inbox.dmInboxEntriesForPanel,
      dmUsersForDmPanelComputed: inbox.dmUsersForDmPanelComputed,
      groupDMListForPanelComputed: inbox.groupDMListForPanelComputed,
      isDmInboxUserFavorite: inbox.isDmInboxUserFavorite,
      isDmInboxGroupFavorite: inbox.isDmInboxGroupFavorite,
      toggleFavoriteDmInbox: inbox.toggleFavoriteDmInbox,
      hideDmFromInboxUser: inbox.hideDmFromInboxUser,
      hideDmFromInboxGroup: inbox.hideDmFromInboxGroup,
      discordBotExportReadyBanner,
      dismissDiscordBotExportReadyBanner,
    },
  };
}
