<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue';
import type { ReactionFavorite } from '@/composables/useReactionFavorites';
import type {
  ChannelSummary,
  MessageWithAuthor,
  MentionEntity,
  PollData,
  ReplyTo,
} from '@shared/types';
import ChatView from '@/components/chat/ChatView.vue';
import { icons } from '@/assets/icons';
import AppLayoutLoadError from '@/components/AppLayoutLoadError.vue';
import AppLayoutSplash from '@/components/AppLayoutSplash.vue';
import type { MemberRole, PopoutAnchorRect } from '@/utils/memberProfiles';
import type { MainSurface } from '@/features/layout/mainSurface';
import type { ChannelCategory } from '@/composables/useChannels';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import type { CallOverlayState } from '@/features/layout/callOverlay';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';

const isDev = import.meta.env.DEV;
const DM_HUB_LOAD_TIMEOUT_MS = 30_000;

const FriendsView = defineAsyncComponent({
  loader: () => import('@/components/FriendsView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: DM_HUB_LOAD_TIMEOUT_MS,
});
const DMCallView = defineAsyncComponent({
  loader: () => import('@/components/DMCallView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: DM_HUB_LOAD_TIMEOUT_MS,
});
const MessageRequestsView = defineAsyncComponent({
  loader: () => import('@/components/MessageRequestsView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: DM_HUB_LOAD_TIMEOUT_MS,
});
const DmNotificationsView = defineAsyncComponent({
  loader: () => import('@/components/DmNotificationsView.vue'),
  loadingComponent: AppLayoutSplash,
  errorComponent: AppLayoutLoadError,
  delay: 200,
  timeout: DM_HUB_LOAD_TIMEOUT_MS,
});

type DmMessageRow = {
  id?: string;
  authorId: string;
  timestamp: string;
  content: string;
};

const props = defineProps<{
  mainSurface: MainSurface;
  callOverlay: CallOverlayState;
  isDmPanelOpen: boolean;
  /** DM rail or dm-* channel — hub views must show even when the DM list panel is collapsed. */
  isDmUiContext: boolean;
  dmActiveTab: 'messages' | 'friends' | 'notifications';
  users: {
    id: string;
    name: string;
    pfp: string;
    status: string;
    customStatus?: string;
  }[];
  /** When set, limits `@` autocomplete to this list; otherwise falls back to `users`. */
  mentionUsers?: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    customStatus?: string;
    username?: string;
    nickname?: string;
  }[];
  currentUserId: string;
  linkedDiscordUserId?: string | null;
  currentUserName?: string;
  currentUserPfp?: string;
  friendIds: string[];
  friendRequestsIncoming: { id: string; fromUserId: string }[];
  friendRequestsOutgoing: { id: string; toUserId: string }[];
  selectedDmUserId: string | null;
  messageRequests: {
    id: string;
    channelId: string;
    fromUserId: string;
    preview: string;
  }[];
  selectedMessageRequestId: string | null;
  messages: Record<string, DmMessageRow[]>;
  echoPeerByChannelId?: ReadonlyMap<string, string>;
  sendMessage: (
    channelId: string,
    content: string,
    mentions?: MentionEntity[],
    imageUrl?: string,
    poll?: PollData,
    gif?: boolean,
    replyTo?: ReplyTo,
    imageSpoiler?: boolean,
    videoUrl?: string,
    attachments?: import('@shared/types').MessageAttachmentPayload[],
  ) => void;
  selectDm: (userId: string) => void;
  acceptFriendRequest: (requestId: string) => void | Promise<void>;
  declineFriendRequest: (requestId: string) => void | Promise<void>;
  cancelFriendRequest: (requestId: string) => void | Promise<void>;
  sendFriendRequest: (toUserId: string) => void | Promise<void>;
  ignoreMessageRequest: (requestId: string) => void | Promise<void>;
  handleAcceptMessageRequest: (requestId: string) => void | Promise<void>;
  returnFromMessageRequests: () => void;
  isInDmMode: boolean;
  isGroupDm: boolean;
  dmPartnerUser: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
  } | null;
  activeGroupDm: { id: string; name: string; pfp?: string } | null;
  activeGroupCallMembers: { id: string; name: string; pfp: string }[];
  dmCallWithUserId: string | null;
  /** LiveKit waiting / ringback state for header copy and pulse. */
  dmCallRinging: boolean;
  /** Pre-accept signaling only; when false but call UI active, embedded CallView may show. */
  dmCallAwaitingAccept: boolean;
  /** Ringing-style visuals (includes lobby after self-leave). */
  dmCallRingUi: boolean;
  dmCallLobbyAfterSelfLeave: boolean;
  dmCallIncoming: boolean;
  dmCallRingRemoteVanishing: boolean;
  dmCallMuted: boolean;
  dmCallDeafened: boolean;
  dmCallVideo: boolean;
  dmCallScreenshare: boolean;
  dmCallFullscreen: boolean;
  endDmCall: () => void;
  leaveDmCallVoice: () => void | Promise<void>;
  rejoinDmCallVoice: () => void;
  answerDmCall: () => void | Promise<void>;
  declineDmCall: () => void | Promise<void>;
  onToggleDmCallMuted: () => void;
  onToggleDmCallDeafened: () => void;
  onToggleDmCallVideo: () => void;
  onToggleDmCallScreenshare: () => void;
  onSetDmCallFullscreen: (next: boolean) => void;
  dmCallCallViewParticipants: Array<{
    id: string;
    name: string;
    pfp: string;
    muted?: boolean;
    deafened?: boolean;
    video?: boolean;
    streaming?: boolean;
    serverMuted?: boolean;
    serverDeafened?: boolean;
    speaking?: boolean;
    audioLevel?: number;
    screenTrack?: unknown;
    screenAudioTrack?: unknown;
    cameraTrack?: unknown;
    dmCallPresence?: 'live' | 'ringing' | 'connecting' | 'declined';
  }>;
  vcRemoteParticipants: Map<string, unknown>;
  liveKitRoom: unknown;
  mirrorLocalCamera: boolean;
  getLocalScreenTrack: () => unknown;
  getLocalCameraTrack: () => unknown;
  getRemoteParticipantVolume?: (userId: string) => number;
  setRemoteParticipantVolume?: (userId: string, volumePercent: number) => void;
  onRequestDmCallFullscreenStream: (participantId: string) => void;
  effectiveActiveChannel: ChannelSummary | null;
  activeChannelMessagesMap: Map<
    string,
    MessageWithAuthor & { channelName?: string }
  >;
  dmThreadSwitchLoading?: boolean;
  surfaceSwitchLoading?: boolean;
  guildShellSettling?: boolean;
  allChannels: ChannelSummary[];
  selectedServerId: string;
  pinnedMessageIdsForCurrentChannel: string[];
  handlePinMessage: (messageId: string) => void;
  handleUnpinMessage: (messageId: string) => void;
  handlePollVote: (messageId: string, optionId: string) => void;
  editMessage: (
    messageId: string,
    content: string,
  ) => boolean | void | Promise<boolean | void>;
  deleteMessage: (messageId: string) => void;
  handleReact: (messageId: string, emoji: string) => void;
  handleGoToChannel: (channelId: string) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  dmMentionNotifications: DmMentionNotificationRow[];
  mentionNotificationHydrationLoading: boolean;
  resolveDmMentionNotificationChannelLabel: (channelId: string) => string;
  resolveDmMentionNotificationAuthorName: (
    row: DmMentionNotificationRow,
  ) => string;
  resolveDmMentionNotificationRowPreview: (
    row: DmMentionNotificationRow,
  ) => string;
  dmNotificationReadStateByChannelId: Readonly<Record<string, string | null>>;
  mentionNotificationCategoriesByServer: Readonly<
    Record<string, ChannelCategory[]>
  >;
  mentionNotificationServers: ReadonlyArray<{
    id: string;
    name: string;
    imageUrl?: string;
  }>;
  dmNotificationsReadPreset: 'all' | 'unread' | 'read';
  dmNotificationsSourceKey: string;
  onUpdateDmNotificationsReadPreset: (
    preset: 'all' | 'unread' | 'read',
  ) => void;
  onUpdateDmNotificationsSourceKey: (key: string) => void;
  isPersistedEchoDmThread: (channelId: string) => boolean;
  onOpenMentionNotification: (row: DmMentionNotificationRow) => void;
  onMarkMentionNotificationRead: (row: DmMentionNotificationRow) => void;
  openMemberProfile: (
    userId: string,
    anchorRect: PopoutAnchorRect | null,
  ) => void;
  openProfileFromContextMenu?: (userId: string) => void;
  /** Friends pending rows — full expanded profile modal. */
  openExtendedProfileModalForUserId?: (userId: string) => void;
  canModerateAuthor?: (authorId: string) => boolean;
  handleModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  resolveAuthorRole?: (userId: string) => MemberRole;
  showNsfwChatGate?: boolean;
  acknowledgeNsfwChannel?: () => void;
  declineNsfwGate?: () => void;
  onOpenExplore?: () => void;
  /** Mobile-only recovery path when this section receives an unexpected surface. */
  onMobileBackToChannels?: () => void;
  topReactions?: ReactionFavorite[];
  removeReactionFavorite?: (emoji: string) => void;
  /** Server owner / manage-server — Discord empty-channel import in guild text chat. */
  canShowDiscordChannelImport?: boolean;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
  /** When false, hide Answer on incoming DM calls (guests cannot join LiveKit). */
  dmCallCanAnswerIncoming?: boolean;
  /** Quarter DM call: header glass already shows controls — hide duplicate chrome in DMCallView. */
  suppressEmbeddedDuplicateCallUi?: boolean;
  /** True only when the open thread is the one the active call belongs to. */
  dmCallMatchesActiveChannel?: boolean;
  activeDmThreadCallUi?: ActiveDmThreadCallUi | null;
  /** Taller global shell header inset (px) for message list padding (e.g. DM quarter-call chrome). */
  headerOverlayInsetPx?: number;
  /** Phone-class presence for DM history intro status dot. */
  presenceMobileByUserId?: Record<string, true>;
  /** Opens user Settings focused on Voice & Video. */
  onOpenVoiceAudioSettings?: () => void;
}>();

/**
 * Non-null only when all three conditions are true:
 *  1. The main surface is an active DM thread.
 *  2. A DM call overlay is in flight.
 *  3. The active thread is the one the call belongs to.
 * Used to decide whether to render the embedded or fullscreen call UI.
 */
const dmCallLayout = computed(() => {
  if (props.mainSurface.type !== 'dmThread') return null;
  if (props.callOverlay.type !== 'dmCall') return null;
  if (!props.activeDmThreadCallUi) return null;
  return props.callOverlay;
});

const usersById = computed(() => {
  const m = new Map<string, (typeof props.users)[number]>();
  for (const u of props.users) m.set(u.id, u);
  return m;
});

const dmHistoryIntro = computed(() => {
  if (props.mainSurface.type !== 'dmThread') return null;
  if (!props.effectiveActiveChannel) return null;

  if (props.isGroupDm) {
    const title = props.activeGroupDm?.name?.trim() || 'Group conversation';
    const subtitle =
      'This is the beginning of your group chat history with this group.';
    return {
      title,
      subtitle,
      avatarUrl: props.activeGroupDm?.pfp || icons.usersAvatar,
      hidePresence: true,
      mutualCommunitiesCount: undefined,
      primaryActionLabel: undefined,
      onPrimaryAction: undefined,
    };
  }

  const partner = props.dmPartnerUser;
  if (!partner) return null;
  const partnerId = partner.id;
  const partnerRich = usersById.value.get(partnerId);
  const incoming = props.friendRequestsIncoming.find(
    (r) => r.fromUserId === partnerId,
  );
  const outgoing = props.friendRequestsOutgoing.find(
    (r) => r.toUserId === partnerId,
  );
  const isFriend = props.friendIds.includes(partnerId);

  let primaryActionLabel: string | undefined;
  let onPrimaryAction: (() => void | Promise<void>) | undefined;
  if (!isFriend && incoming) {
    primaryActionLabel = 'Accept Friend Request';
    onPrimaryAction = () => props.acceptFriendRequest(incoming.id);
  } else if (!isFriend && outgoing) {
    primaryActionLabel = 'Cancel Friend Request';
    onPrimaryAction = () => props.cancelFriendRequest(outgoing.id);
  } else if (!isFriend) {
    primaryActionLabel = 'Send Friend Request';
    onPrimaryAction = () => props.sendFriendRequest(partnerId);
  }

  const displayName = partner.name.trim() || 'this user';

  return {
    title: displayName,
    subtitle: `This is the beginning of your direct message history with ${displayName}.`,
    avatarUrl: partner.pfp,
    presenceStatus:
      partnerRich?.status?.trim() || partner.status?.trim() || 'offline',
    presenceMobileSurface: !!props.presenceMobileByUserId?.[partnerId],
    hidePresence: false,
    mutualCommunitiesCount: undefined,
    primaryActionLabel,
    onPrimaryAction,
  };
});

async function handleDmCallLeave() {
  await Promise.resolve(props.leaveDmCallVoice());
}
</script>

<template>
  <div
    v-if="mainSurface.type === 'dmFriends'"
    class="flex min-h-0 flex-1 flex-col"
  >
    <FriendsView
      class="min-h-0 flex-1"
      :users="users"
      :current-user-id="currentUserId"
      :friend-ids="friendIds"
      :friend-requests-incoming="friendRequestsIncoming"
      :friend-requests-outgoing="friendRequestsOutgoing"
      :selected-user-id="selectedDmUserId"
      :echo-peer-by-channel-id="echoPeerByChannelId"
      :messages="messages"
      @select-dm="selectDm"
      @accept-friend-request="acceptFriendRequest"
      @decline-friend-request="declineFriendRequest"
      @cancel-friend-request="cancelFriendRequest"
      @send-friend-request="sendFriendRequest"
      @open-expanded-profile="
        (userId) => openExtendedProfileModalForUserId?.(userId)
      "
      @back-to-messages="returnFromMessageRequests"
    />
  </div>

  <div
    v-else-if="mainSurface.type === 'dmNotifications'"
    class="flex min-h-0 flex-1 flex-col"
  >
    <DmNotificationsView
      class="min-h-0 flex-1"
      :current-user-id="currentUserId"
      :users="users"
      :rows="dmMentionNotifications"
      :hydration-loading="mentionNotificationHydrationLoading"
      :resolve-channel-label="resolveDmMentionNotificationChannelLabel"
      :resolve-author-name="resolveDmMentionNotificationAuthorName"
      :resolve-preview="resolveDmMentionNotificationRowPreview"
      :read-state-by-channel-id="dmNotificationReadStateByChannelId"
      :categories-by-server="mentionNotificationCategoriesByServer"
      :mention-servers="mentionNotificationServers"
      :echo-peer-by-channel-id="echoPeerByChannelId"
      :read-preset="dmNotificationsReadPreset"
      :source-key="dmNotificationsSourceKey"
      :show-filters="true"
      :is-persisted-echo-dm-thread="isPersistedEchoDmThread"
      @open-row="onOpenMentionNotification"
      @mark-row-read="onMarkMentionNotificationRead"
      @update:read-preset="onUpdateDmNotificationsReadPreset"
      @update:source-key="onUpdateDmNotificationsSourceKey"
      @back-to-messages="returnFromMessageRequests"
    />
  </div>

  <div
    v-else-if="mainSurface.type === 'dmRequests'"
    class="flex min-h-0 flex-1 flex-col"
  >
    <MessageRequestsView
      class="min-h-0 flex-1"
      :users="users"
      :current-user-id="currentUserId"
      :current-user-name="currentUserName"
      :message-requests="messageRequests"
      :messages="messages"
      :selected-request-id="selectedMessageRequestId"
      :send-message="sendMessage"
      @accept-request="handleAcceptMessageRequest"
      @select-dm="selectDm"
      @ignore-request="ignoreMessageRequest"
      @back-to-messages="returnFromMessageRequests"
    />
  </div>

  <div
    v-else-if="mainSurface.type === 'dmMessagesIdle'"
    class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-fg-subtle"
  >
    <p>
      Select a conversation from your DMs, or open Friends to start messaging.
    </p>
  </div>

  <template v-else-if="dmCallLayout">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <DMCallView
        v-if="dmCallLayout.fullscreen"
        class="min-h-0 min-w-0 flex-1 border-r border-border"
        :partner-name="
          dmPartnerUser ? dmPartnerUser.name : activeGroupDm?.name || ''
        "
        :partner-pfp="
          dmPartnerUser
            ? dmPartnerUser.pfp
            : activeGroupDm?.pfp || icons.usersAvatar
        "
        :partner-id="dmPartnerUser ? dmPartnerUser.id : activeGroupDm?.id || ''"
        :current-user-name="currentUserName ?? ''"
        :current-user-pfp="currentUserPfp ?? ''"
        :current-user-id="currentUserId"
        :muted="dmCallMuted"
        :deafened="dmCallDeafened"
        :video="dmCallVideo"
        :incoming="dmCallIncoming"
        :screenshare="dmCallScreenshare"
        :group-members="isGroupDm ? activeGroupCallMembers : []"
        :fullscreen="true"
        :ringing="dmCallRinging"
        :ring-ui-chrome="dmCallRingUi"
        :lobby-awaiting-rejoin="dmCallLobbyAfterSelfLeave"
        :ring-remote-vanishing="dmCallRingRemoteVanishing"
        :dm-call-awaiting-accept="dmCallAwaitingAccept"
        :call-view-participants="dmCallCallViewParticipants"
        :remote-participants="vcRemoteParticipants"
        :lk-room="liveKitRoom"
        :mirror-local-camera="mirrorLocalCamera"
        :get-local-screen-track="getLocalScreenTrack"
        :get-local-camera-track="getLocalCameraTrack"
        :get-remote-participant-volume="getRemoteParticipantVolume"
        :set-remote-participant-volume="setRemoteParticipantVolume"
        :on-request-fullscreen-stream="onRequestDmCallFullscreenStream"
        :on-open-profile="openMemberProfile"
        :on-open-profile-from-context-menu="openProfileFromContextMenu"
        :can-answer-incoming-call="dmCallCanAnswerIncoming !== false"
        :on-open-voice-audio-settings="onOpenVoiceAudioSettings"
        @leave="handleDmCallLeave"
        @rejoin="rejoinDmCallVoice"
        @accept="answerDmCall"
        @decline="declineDmCall"
        @toggle-mute="onToggleDmCallMuted"
        @toggle-deafen="onToggleDmCallDeafened"
        @toggle-video="onToggleDmCallVideo"
        @toggle-screenshare="onToggleDmCallScreenshare"
        @toggle-fullscreen="onSetDmCallFullscreen(false)"
      />
      <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col">
        <DMCallView
          v-if="!suppressEmbeddedDuplicateCallUi"
          class="min-h-0 min-w-0 shrink-0 border-b border-border"
          :partner-name="
            dmPartnerUser ? dmPartnerUser.name : activeGroupDm?.name || ''
          "
          :partner-pfp="
            dmPartnerUser
              ? dmPartnerUser.pfp
              : activeGroupDm?.pfp || icons.usersAvatar
          "
          :partner-id="
            dmPartnerUser ? dmPartnerUser.id : activeGroupDm?.id || ''
          "
          :current-user-name="currentUserName ?? ''"
          :current-user-pfp="currentUserPfp ?? ''"
          :current-user-id="currentUserId"
          :muted="dmCallMuted"
          :deafened="dmCallDeafened"
          :video="dmCallVideo"
          :incoming="dmCallIncoming"
          :screenshare="dmCallScreenshare"
          :group-members="isGroupDm ? activeGroupCallMembers : []"
          :fullscreen="false"
          :ringing="dmCallRinging"
          :ring-ui-chrome="dmCallRingUi"
          :lobby-awaiting-rejoin="dmCallLobbyAfterSelfLeave"
          :ring-remote-vanishing="dmCallRingRemoteVanishing"
          :dm-call-awaiting-accept="dmCallAwaitingAccept"
          :call-view-participants="dmCallCallViewParticipants"
          :remote-participants="vcRemoteParticipants"
          :lk-room="liveKitRoom"
          :mirror-local-camera="mirrorLocalCamera"
          :get-local-screen-track="getLocalScreenTrack"
          :get-local-camera-track="getLocalCameraTrack"
          :get-remote-participant-volume="getRemoteParticipantVolume"
          :set-remote-participant-volume="setRemoteParticipantVolume"
          :on-request-fullscreen-stream="onRequestDmCallFullscreenStream"
          :on-open-profile="openMemberProfile"
          :on-open-profile-from-context-menu="openProfileFromContextMenu"
          :can-answer-incoming-call="dmCallCanAnswerIncoming !== false"
          :suppress-quarter-glass-call-chrome="suppressEmbeddedDuplicateCallUi"
          :on-open-voice-audio-settings="onOpenVoiceAudioSettings"
          @leave="handleDmCallLeave"
          @rejoin="rejoinDmCallVoice"
          @accept="answerDmCall"
          @decline="declineDmCall"
          @toggle-mute="onToggleDmCallMuted"
          @toggle-deafen="onToggleDmCallDeafened"
          @toggle-video="onToggleDmCallVideo"
          @toggle-screenshare="onToggleDmCallScreenshare"
          @toggle-fullscreen="onSetDmCallFullscreen(true)"
        />
        <ChatView
          class="min-h-0 min-w-0 flex-1"
          :active-channel="effectiveActiveChannel"
          :active-channel-messages="activeChannelMessagesMap"
          :header-overlay-inset-px="headerOverlayInsetPx"
          :server-id="undefined"
          :users="users"
          :mention-users="mentionUsers"
          :channels="allChannels"
          :send-message="sendMessage"
          :on-request-forward="onRequestForward"
          :current-user-id="currentUserId"
          :linked-discord-user-id="linkedDiscordUserId ?? null"
          :current-user-name="currentUserName"
          :current-user-pfp="currentUserPfp"
          :pinned-message-ids="pinnedMessageIdsForCurrentChannel"
          :on-pin="handlePinMessage"
          :on-unpin="handleUnpinMessage"
          :on-poll-vote="handlePollVote"
          :on-save-edit="editMessage"
          :on-delete="deleteMessage"
          :on-react="handleReact"
          :top-reactions="topReactions"
          :remove-reaction-favorite="removeReactionFavorite"
          :on-go-to-channel="handleGoToChannel"
          :on-go-to-message="handleGoToMessage"
          :on-open-profile="openMemberProfile"
          :on-open-profile-from-context-menu="openProfileFromContextMenu"
          :can-moderate-author="canModerateAuthor"
          :on-moderate-user="handleModerateUser"
          :show-nsfw-gate="showNsfwChatGate"
          :on-nsfw-acknowledge="acknowledgeNsfwChannel"
          :on-nsfw-decline="declineNsfwGate"
          :transition-loading="dmThreadSwitchLoading"
          :can-show-discord-channel-import="false"
          :dm-history-intro="dmHistoryIntro"
        />
      </div>
    </div>
  </template>

  <ChatView
    v-else-if="mainSurface.type === 'dmThread'"
    class="min-h-0 min-w-0 flex-1"
    :active-channel="effectiveActiveChannel"
    :active-channel-messages="activeChannelMessagesMap"
    :header-overlay-inset-px="headerOverlayInsetPx"
    :server-id="undefined"
    :users="users"
    :mention-users="mentionUsers"
    :channels="allChannels"
    :send-message="sendMessage"
    :on-request-forward="onRequestForward"
    :current-user-id="currentUserId"
    :linked-discord-user-id="linkedDiscordUserId ?? null"
    :current-user-name="currentUserName"
    :current-user-pfp="currentUserPfp"
    :pinned-message-ids="pinnedMessageIdsForCurrentChannel"
    :on-pin="handlePinMessage"
    :on-unpin="handleUnpinMessage"
    :on-poll-vote="handlePollVote"
    :on-save-edit="editMessage"
    :on-delete="deleteMessage"
    :on-react="handleReact"
    :top-reactions="topReactions"
    :remove-reaction-favorite="removeReactionFavorite"
    :on-go-to-channel="handleGoToChannel"
    :on-go-to-message="handleGoToMessage"
    :on-open-profile="openMemberProfile"
    :on-open-profile-from-context-menu="openProfileFromContextMenu"
    :can-moderate-author="canModerateAuthor"
    :on-moderate-user="handleModerateUser"
    :show-nsfw-gate="showNsfwChatGate"
    :on-nsfw-acknowledge="acknowledgeNsfwChannel"
    :on-nsfw-decline="declineNsfwGate"
    :transition-loading="dmThreadSwitchLoading"
    :can-show-discord-channel-import="false"
    :dm-history-intro="dmHistoryIntro"
  />

  <ChatView
    v-else-if="
      (mainSurface.type === 'serverText' ||
        mainSurface.type === 'serverEmptyOnboarding') &&
      effectiveActiveChannel?.type !== 'paper'
    "
    class="min-h-0 min-w-0 flex-1"
    :active-channel="effectiveActiveChannel"
    :active-channel-messages="activeChannelMessagesMap"
    :header-overlay-inset-px="headerOverlayInsetPx"
    :server-id="selectedServerId"
    :resolve-author-role="resolveAuthorRole"
    :users="users"
    :mention-users="mentionUsers"
    :channels="allChannels"
    :send-message="sendMessage"
    :on-request-forward="onRequestForward"
    :current-user-id="currentUserId"
    :linked-discord-user-id="linkedDiscordUserId ?? null"
    :current-user-name="currentUserName"
    :current-user-pfp="currentUserPfp"
    :on-poll-vote="handlePollVote"
    :on-save-edit="editMessage"
    :on-delete="deleteMessage"
    :on-react="handleReact"
    :top-reactions="topReactions"
    :remove-reaction-favorite="removeReactionFavorite"
    :on-go-to-channel="handleGoToChannel"
    :on-go-to-message="handleGoToMessage"
    :on-open-profile="openMemberProfile"
    :on-open-profile-from-context-menu="openProfileFromContextMenu"
    :can-moderate-author="canModerateAuthor"
    :on-moderate-user="handleModerateUser"
    :show-nsfw-gate="showNsfwChatGate"
    :on-nsfw-acknowledge="acknowledgeNsfwChannel"
    :on-nsfw-decline="declineNsfwGate"
    :no-servers-yet="mainSurface.type === 'serverEmptyOnboarding'"
    :on-open-explore="onOpenExplore"
    :can-show-discord-channel-import="canShowDiscordChannelImport"
    :transition-loading="surfaceSwitchLoading"
    :guild-shell-settling="guildShellSettling"
  />

  <div
    v-else-if="mainSurface.type === 'unknown'"
    class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-fg-soft"
  >
    <p>This channel could not be loaded.</p>
    <p v-if="isDev" class="text-xs text-fg-subtle">
      {{ mainSurface.reason }} — {{ mainSurface.channelId }}
    </p>
  </div>

  <!-- explore / serverVoice: parent should not mount this section; keep a visible dev signal. -->
  <div
    v-else
    class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-xs text-amber-200/70"
  >
    <template v-if="isDev"
      >Unexpected main column surface: {{ mainSurface.type }}</template
    >
    <template v-else>Something went wrong loading this view.</template>
    <button
      v-if="onMobileBackToChannels"
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-fg-soft transition hover:bg-white/10 md:hidden"
      aria-label="Back to channels"
      @click="onMobileBackToChannels"
    >
      <img
        :src="icons.arrowLeft"
        alt=""
        class="h-3.5 w-3.5 opacity-90 filter invert"
      />
      <span>Back to channels</span>
    </button>
  </div>
</template>
