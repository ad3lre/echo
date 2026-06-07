<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  ref,
  toRef,
  unref,
  watch,
  watchEffect,
  type ComputedRef,
  type MaybeRef,
  type ShallowRef,
} from 'vue';
import type {
  EchoHangmanActivityV1,
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesSettingsV1,
  EchoSkrigglesStrokeBatchV1,
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesRoleAssignmentV1,
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import type { ReactionFavorite } from '@/composables/useReactionFavorites';
import type {
  ChannelSummary,
  MessageWithAuthor,
  MentionEntity,
  PollData,
  ReplyTo,
} from '@shared/types';
import ChatView from '@/components/chat/ChatView.vue';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';
import type { Room as LKRoom } from 'livekit-client';
import { icons } from '@/assets/icons';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import { useCoarsePointer } from '@/composables/useCoarsePointer';
import type {
  VcActivityPresenceKind,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import type { VcYoutubeRemotePlaybackState } from '@/features/voice/composables/useVcYoutubeWatchTogetherPlayer';
import { storeToRefs } from 'pinia';
import { useEchoSessionStore } from '@/stores/echoSession';
import { useStageVcLobby } from '@/features/voice/composables/useStageVcLobby';
import { parseStageModeFromDescription } from '@/features/voice/stage/stageLobbyUtils';
import { resolveVoiceChannelForParticipants } from '@/features/layout/resolveVoiceChannelForParticipants';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';

const CallView = defineAsyncComponent(
  () => import('@/components/CallView.vue'),
);
const StageCallView = defineAsyncComponent(
  () => import('@/features/voice/components/StageCallView.vue'),
);
const StageVcLobby = defineAsyncComponent(
  () => import('@/features/voice/components/StageVcLobby.vue'),
);
const StageEventScheduleModal = defineAsyncComponent(
  () => import('@/features/voice/components/StageEventScheduleModal.vue'),
);
/**
 * Hosts the in-call activity mini-games (Hangman, Codenames, Skriggles, TicTacToe,
 * Wordline — ~220 KB together). Only renders when the VC activity surface is open
 * (`vcActivitySurfaceOpen`), so load it lazily to keep that bundle off the
 * first-paint AppLayout chunk; it downloads the first time a user opens an activity.
 */
const VcActivityStage = defineAsyncComponent(
  () => import('@/features/voice/components/VcActivityStage.vue'),
);

const liveKitConnected = computed(() => !!props.lkRoom);

const props = defineProps<{
  isViewingVoiceChannel: boolean;
  /** Connected guild voice/stage channel (LiveKit session), if any. */
  currentVoiceChannelId?: string | null;
  effectiveActiveChannel: ChannelSummary | null;
  getChannelDisplayName: (name?: string) => string;
  activeVoiceChannelParticipants: Array<{
    id: string;
    name: string;
    pfp: string;
    muted?: boolean;
    deafened?: boolean;
    video?: boolean;
    streaming?: boolean;
    serverMuted?: boolean;
    serverDeafened?: boolean;
    activityPresence?: VcActivityPresenceKind[];
    isVcActivityKing?: boolean;
  }>;
  currentUserId?: string;
  linkedDiscordUserId?: string | null;
  currentUserName?: string;
  currentUserPfp?: string;
  selectedServerId: string;
  /** Manage Channels on the active stage channel (YouTube live, schedule event). */
  canManageStageChannel?: boolean;
  users: { id: string; name: string; pfp: string }[];
  mentionUsers?: { id: string; name: string; pfp: string; status?: string }[];
  allChannels: ChannelSummary[];
  activeChannelMessagesMap: Map<
    string,
    MessageWithAuthor & { channelName?: string }
  >;
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
  voiceSideChatCollapsed: boolean;
  voiceSideChatWidth: number;
  startVoiceSideChatResize: (event: MouseEvent) => void;
  resetVoiceSideChatWidth: () => void;
  expandVoiceSideChat: () => void;
  /** Collapse/expand voice side chat (mobile sheet uses this for the drag handle). */
  toggleVoiceSideChat: () => void;
  /** Compact guild mobile sheet: 0 hidden, 1 half screen, 2 near-full. */
  voiceMobileSheetLevel: number;
  bumpVoiceMobileChatFromCallScrollUp: () => void;
  bumpVoiceMobileChatFromCallScrollDown: () => void;
  /** Guild tri-pane compact shell — mobile-style VC + bottom chat sheet. */
  isCompactMobileGuild: boolean;
  /** Sub-800px shell: channel column width is not part of the grid. */
  isCompactShell?: boolean;
  /** Desktop: narrows the channel column when activity content still overflows vertically. */
  narrowChannelPanelForActivityOverflowStep?: () => boolean;
  /** Extra px reserved above safe-area when `GuildMobileVoiceDock` is visible. */
  voiceMobileDockReservePx?: number;
  handleCallViewOpenProfile: (
    userId: string,
    anchorRect: PopoutAnchorRect | null,
  ) => void;
  canModerateVcParticipant?: (userId: string) => boolean;
  canVcModerateParticipantAction?: (
    userId: string,
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience'
      | 'stopCamera'
      | 'stopScreenShare',
  ) => boolean;
  handleVcModerate?: (payload: {
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience'
      | 'stopCamera'
      | 'stopScreenShare';
    targetUserId: string;
    targetChannelId?: string;
    contextVoiceChannelId?: string;
  }) => void;
  handlePollVote: (messageId: string, optionId: string) => void;
  editMessage: (
    messageId: string,
    newContent: string,
  ) => boolean | void | Promise<boolean | void>;
  deleteMessage: (messageId: string) => void;
  handleReact: (messageId: string, emoji: string) => void;
  handleGoToChannel: (channelId: string) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  openMemberProfile: (
    userId: string,
    anchorRect: PopoutAnchorRect | null,
  ) => void;
  canModerateAuthor?: (authorId: string) => boolean;
  handleModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  showNsfwChatGate?: boolean;
  acknowledgeNsfwChannel?: () => void;
  declineNsfwGate?: () => void;
  topReactions?: ReactionFavorite[];
  removeReactionFavorite?: (emoji: string) => void;
  remoteParticipants?: Map<string, RemoteParticipantTrackInfo>;
  lkRoom?: LKRoom | null;
  mirrorLocalCamera?: boolean;
  getLocalScreenTrack?: () => unknown;
  getLocalCameraTrack?: () => unknown;
  getRemoteParticipantVolume?: (userId: string) => number;
  setRemoteParticipantVolume?: (userId: string, volumePercent: number) => void;
  onRequestFullscreenStream?: (participantId: string) => void;
  vcActivityUi: MaybeRef<VcActivityUiState>;
  openVcActivityPicker: () => void;
  openVcActivityYoutubeBrowse: () => void;
  openVcActivityWordle: () => void;
  openVcActivityHangman: () => void;
  openVcActivitySkriggles: () => void;
  openVcActivityTicTacToe: () => void;
  vcHangmanActivity: ComputedRef<EchoHangmanActivityV1 | null>;
  hangmanRosterUserIds: ComputedRef<string[]>;
  commitVcHangmanWord: (raw: string) => string | null;
  requestVcHangmanGuessLetter: (letter: string) => void;
  requestVcHangmanNextRound: () => void;
  vcSkrigglesActivity: ComputedRef<EchoSkrigglesActivityV1 | null>;
  skrigglesRosterUserIds: ComputedRef<string[]>;
  skrigglesCanvasEvents: ShallowRef<
    import('@/features/voice/skriggles/skrigglesVoiceSession').SkrigglesCanvasEvent[]
  >;
  commitSkrigglesWordChoice: (word: string) => void;
  submitSkrigglesGuess: (guess: string) => void;
  updateSkrigglesSettings: (settings: Partial<EchoSkrigglesSettingsV1>) => void;
  startSkrigglesGame: () => void;
  advanceSkrigglesRound: () => void;
  publishSkrigglesStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishSkrigglesCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishSkrigglesCanvasSnapshot: (
    snapshot: EchoSkrigglesCanvasSnapshotV1,
  ) => void;
  tickSkrigglesTimers: () => void;
  vcTicTacToeActivity: ComputedRef<EchoTicTacToeActivityV1 | null>;
  vcTicTacToePendingInvite: ComputedRef<EchoTicTacToeInviteV1 | null>;
  sendVcTicTacToeChallenge: (toUserId: string) => void;
  respondVcTicTacToeInvite: (accept: boolean) => void;
  dismissVcTicTacToeInvite: () => void;
  requestVcTicTacToeMove: (cellIndex: number) => void;
  requestVcTicTacToeRematch: () => void;
  vcCodenamesActivity: ComputedRef<EchoCodenamesActivityV1 | null>;
  codenamesRosterUserIds: ComputedRef<string[]>;
  vcCodenamesSpymasterKey: ComputedRef<EchoCodenamesAffiliationV1[] | null>;
  commitVcCodenamesDeal: () => string | null;
  requestVcCodenamesSetup: (
    assignments: EchoCodenamesRoleAssignmentV1[],
  ) => void;
  requestVcCodenamesClue: (word: string, number: number) => void;
  requestVcCodenamesReveal: (cardIndex: number) => void;
  requestVcCodenamesEndTurn: () => void;
  requestVcCodenamesNewGame: () => void;
  requestVcCodenamesPushKeyToOrchestrator: () => void;
  openVcActivityOpenGuessr: () => void;
  openVcActivitySkribblIo: () => void;
  openVcActivityGarticPhone: () => void;
  openVcActivityKrunker: () => void;
  openVcActivityCodenames: () => void;
  openVcActivityRichup: () => void;
  openVcActivityGooberDash: () => void;
  openVcActivitySmashKarts: () => void;
  openVcActivityClusterRush: () => void;
  setVcActivityYoutubeVideo: (
    videoId: string,
    meta?: Partial<
      Pick<
        import('@/features/voice/vcActivityTypes').YoutubePlaylistEntry,
        'title' | 'channelTitle' | 'thumbnailUrl'
      >
    >,
  ) => void;
  setVcYoutubeBrowseOpen: (open: boolean) => void;
  addVcYoutubeToQueue: (
    entry: import('@/features/voice/vcActivityTypes').YoutubePlaylistEntry,
  ) => void;
  removeVcYoutubeFromQueue: (index: number) => void;
  moveVcYoutubeInQueue: (from: number, to: number) => void;
  playVcYoutubeAtIndex: (index: number) => void;
  playVcYoutubeNext: () => void;
  playVcYoutubePrevious: () => void;
  closeVcActivity: () => void;
  vcYoutubeRemotePlayback: ShallowRef<VcYoutubeRemotePlaybackState | null>;
  publishVcYoutubePlaybackSync: (sample: EchoYoutubePlaybackSyncV1) => void;
  vcYoutubePlaybackShouldPublish: ComputedRef<boolean>;
  /** Server owner / manage-server — Discord empty-channel import (voice side chat). */
  canShowDiscordChannelImport?: boolean;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
  guildVcMuted: boolean;
  guildVcDeafened: boolean;
  guildVcVideo: boolean;
  guildVcScreenshare: boolean;
  onGuildVcMuted: (next: boolean) => void;
  onGuildVcDeafened: (next: boolean) => void;
  onGuildVcVideo: (next: boolean) => void;
  onGuildVcScreenshare: (next: boolean) => void;
  onLeaveVoice: () => void | Promise<void>;
  channelPanelCollapsed?: boolean;
  expandChannels?: () => void;
  onMobileBackToChannels?: () => void;
  /** Jump to owning guild and highlight this VC in the channel list. */
  focusGuildVoiceChannelInSidebar?: () => void;
  /** Join the guild voice/stage channel (used when entering stage from the lobby). */
  joinVoiceChannel?: (channelId: string) => void;
}>();

/** Stage vs VC chrome follows the connected channel when in a voice session. */
const voiceUiChannel = computed(() =>
  resolveVoiceChannelForParticipants({
    currentVoiceChannelId: props.currentVoiceChannelId,
    findChannelContextById: (id) => {
      const ch = props.allChannels.find((c) => c.id === id);
      return ch ? { channel: ch } : null;
    },
    effectiveActiveChannel: props.effectiveActiveChannel,
  }),
);

const isStageChannel = computed(() => voiceUiChannel.value?.type === 'stage');
const stageSpeakerByUserId = computed(
  () => voiceUiChannel.value?.voiceStageSpeakerByUserId ?? {},
);

// Warm voice call chunks only when voice UI is active (keeps startup tests/paths light).
watchEffect(() => {
  if (!props.isViewingVoiceChannel) return;
  void import('@/components/CallView.vue');
  if (isStageChannel.value) {
    void import('@/features/voice/components/StageCallView.vue');
    void import('@/features/voice/components/StageVcLobby.vue');
  }
});

const coarsePointer = useCoarsePointer();

const channelIconResolver = useChannelIconResolver(
  toRef(() => props.selectedServerId ?? undefined),
);

const voiceSideChatIconVisual = computed(() =>
  channelIconResolver.getVisual(props.effectiveActiveChannel ?? null),
);
const voiceSideChatEmoji = computed(() => {
  const v = voiceSideChatIconVisual.value;
  return v.kind === 'emoji' ? v.emoji : null;
});
const voiceSideChatIconUrl = computed(() => {
  const v = voiceSideChatIconVisual.value;
  if (v.kind === 'svg' || v.kind === 'image') return v.url;
  return channelIconResolver.getIconUrl(props.effectiveActiveChannel ?? null);
});
const voiceSideChatTitle = computed(() => {
  if (!props.effectiveActiveChannel) return 'Voice Chat';
  const name = props.getChannelDisplayName(props.effectiveActiveChannel.name);
  return name ? `${name} - chat` : 'Voice Chat';
});

const voiceChannelActivityLabel = computed(() => {
  if (!props.effectiveActiveChannel) return 'Voice channel';
  const name = props.getChannelDisplayName(props.effectiveActiveChannel.name);
  return name ? name : 'Voice channel';
});

const vcActivitySurfaceOpen = computed(
  () => unref(props.vcActivityUi).phase !== 'closed',
);

const echoSession = useEchoSessionStore();
const { upcomingEventsByServerId } = storeToRefs(echoSession);

const stageChannelId = computed(() => voiceUiChannel.value?.id ?? '');
const voiceConnectedToStageChannel = computed(() => {
  const connected = props.currentVoiceChannelId?.trim();
  const stageId = stageChannelId.value.trim();
  return !!connected && !!stageId && connected === stageId;
});
const stageUpcomingEvents = computed(
  () => upcomingEventsByServerId.value[props.selectedServerId] ?? [],
);

const channelHasActiveVcActivity = computed(() => {
  if (unref(props.vcActivityUi).phase !== 'closed') return true;
  return props.activeVoiceChannelParticipants.some(
    (p) => (p.activityPresence?.length ?? 0) > 0,
  );
});

const {
  showLobby: stageShowLobby,
  planningEvent: stagePlanningEvent,
  activeStageEvent: stageActiveStageEvent,
  nowMs: stageLobbyNowMs,
  dismissLobby: dismissStageLobby,
} = useStageVcLobby({
  isStageChannel,
  channelId: stageChannelId,
  serverId: computed(() => props.selectedServerId),
  upcomingEvents: stageUpcomingEvents,
  vcActivityUi: props.vcActivityUi,
  channelHasActiveVcActivity,
  voiceConnectedToChannel: voiceConnectedToStageChannel,
});

const canManageStage = computed(() => props.canManageStageChannel === true);
const stageScheduleModalOpen = ref(false);
const stageEventPromptYoutubeLive = ref(false);
const stageEventStartedFromLobby = ref(false);

function onStageLobbyVoiceOnly() {
  dismissStageLobby('voice_only');
  const stageId = stageChannelId.value.trim();
  if (
    stageId &&
    props.joinVoiceChannel &&
    !voiceConnectedToStageChannel.value
  ) {
    props.joinVoiceChannel(stageId);
  }
}

function onStageLobbyYoutubeLiveStarted() {
  dismissStageLobby('youtube_live');
}

function onStageLobbySchedule() {
  stageScheduleModalOpen.value = true;
}

function onStageLobbyPlanned(event: EchoWorkspaceEventSummary) {
  dismissStageLobby('planned_event', event);
  stageEventStartedFromLobby.value = true;
  stageEventPromptYoutubeLive.value =
    parseStageModeFromDescription(event.description ?? '') === 'youtube_live';
}

function onDismissStageEventBanner() {
  stageActiveStageEvent.value = null;
  stageEventPromptYoutubeLive.value = false;
  stageEventStartedFromLobby.value = false;
}

function onDismissYoutubeLivePrompt() {
  stageEventPromptYoutubeLive.value = false;
}

watch(
  () => voiceUiChannel.value?.id,
  (next, prev) => {
    if (next === prev) return;
    stageScheduleModalOpen.value = false;
    stageEventPromptYoutubeLive.value = false;
    stageEventStartedFromLobby.value = false;
  },
);

const dockReservePx = computed(() => props.voiceMobileDockReservePx ?? 0);

const voiceMobileSheetBottomStyle = computed(() => {
  const extra = dockReservePx.value;
  const dock = extra > 0 ? ` + ${extra}px` : '';
  return {
    bottom: `calc(3.5rem${dock} + env(safe-area-inset-bottom, 0px))`,
  };
});

const mobileSheetFrameClass = computed(() => {
  if (props.voiceSideChatCollapsed) return '';
  if (props.voiceMobileSheetLevel >= 2) {
    return 'h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))]';
  }
  return coarsePointer.value
    ? 'h-[58dvh] max-h-[58dvh]'
    : 'h-[50dvh] max-h-[50dvh]';
});

let lastCompactVoiceGestureAt = 0;
let callTouchStartY: number | null = null;
let sheetChromeTouchStartY: number | null = null;

function isInteractiveWheelTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest(
    'input,textarea,button,select,a,[contenteditable="true"]',
  );
}

function onCompactVoiceCallWheel(e: WheelEvent) {
  if (!props.isCompactMobileGuild) return;
  if (isInteractiveWheelTarget(e.target)) return;
  const now = Date.now();
  if (now - lastCompactVoiceGestureAt < 400) return;
  if (e.deltaY < -30) {
    lastCompactVoiceGestureAt = now;
    props.bumpVoiceMobileChatFromCallScrollUp();
  } else if (e.deltaY > 30 && props.voiceMobileSheetLevel === 1) {
    lastCompactVoiceGestureAt = now;
    props.bumpVoiceMobileChatFromCallScrollDown();
  }
}

function onCompactVoiceTouchStart(e: TouchEvent) {
  if (!props.isCompactMobileGuild || e.touches.length !== 1) return;
  callTouchStartY = e.touches[0].clientY;
}

function onCompactVoiceTouchEnd(e: TouchEvent) {
  if (!props.isCompactMobileGuild || callTouchStartY == null) return;
  const startY = callTouchStartY;
  callTouchStartY = null;
  const te = e.changedTouches[0];
  if (!te) return;
  const dy = startY - te.clientY;
  const now = Date.now();
  if (now - lastCompactVoiceGestureAt < 450) return;
  if (dy > 64) {
    lastCompactVoiceGestureAt = now;
    props.bumpVoiceMobileChatFromCallScrollUp();
  } else if (dy < -64 && props.voiceMobileSheetLevel === 1) {
    lastCompactVoiceGestureAt = now;
    props.bumpVoiceMobileChatFromCallScrollDown();
  }
}

function onSheetChromeWheel(e: WheelEvent) {
  if (!props.isCompactMobileGuild) return;
  const now = Date.now();
  if (now - lastCompactVoiceGestureAt < 400) return;
  if (e.deltaY > 30 && props.voiceMobileSheetLevel >= 1) {
    lastCompactVoiceGestureAt = now;
    props.bumpVoiceMobileChatFromCallScrollDown();
  }
}

function onSheetChromeTouchStart(e: TouchEvent) {
  if (!props.isCompactMobileGuild || e.touches.length !== 1) return;
  sheetChromeTouchStartY = e.touches[0].clientY;
}

function onSheetChromeTouchEnd(e: TouchEvent) {
  if (!props.isCompactMobileGuild || sheetChromeTouchStartY == null) return;
  const te = e.changedTouches[0];
  const startY = sheetChromeTouchStartY;
  sheetChromeTouchStartY = null;
  if (!te || props.voiceMobileSheetLevel < 1) return;
  const dy = startY - te.clientY;
  const now = Date.now();
  if (now - lastCompactVoiceGestureAt < 450) return;
  if (dy < -56) {
    lastCompactVoiceGestureAt = now;
    props.bumpVoiceMobileChatFromCallScrollDown();
  }
}
</script>

<template>
  <template v-if="isViewingVoiceChannel">
    <!-- No pt-12: glass channel header is hidden in voice mode; CallView supplies its own title bar. -->
    <div
      class="voice-section-root flex min-h-0 min-w-0 flex-1 flex-col"
      :class="{ 'voice-section-root--mobile': isCompactMobileGuild }"
    >
      <div
        class="voice-section-main flex min-h-0 min-w-0 flex-1"
        :class="
          isCompactMobileGuild ? 'relative flex-col' : 'flex-row items-stretch'
        "
      >
        <button
          v-if="
            voiceSideChatCollapsed && !vcActivitySurfaceOpen && !stageShowLobby
          "
          type="button"
          class="voice-chat-reopen-action group absolute left-1/2 z-[44] inline-flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border px-3.5 py-2 text-sm font-semibold text-fg transition-colors"
          :class="
            isCompactMobileGuild
              ? 'voice-chat-reopen-action--mobile'
              : 'voice-chat-reopen-action--desktop'
          "
          aria-label="Reopen chat"
          title="Reopen chat"
          @click="expandVoiceSideChat"
        >
          <svg
            class="h-4 w-4 text-fg-soft transition-colors group-hover:text-fg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          </svg>
          <span>Reopen chat</span>
        </button>
        <div
          class="min-w-0 min-h-0"
          :class="[
            isCompactMobileGuild
              ? 'relative flex min-h-0 min-w-0 flex-1 flex-col'
              : 'flex min-h-0 min-w-0 flex-1 flex-col',
            stageShowLobby ? 'z-[46]' : '',
          ]"
          @wheel.passive="
            (e: WheelEvent) =>
              isCompactMobileGuild && onCompactVoiceCallWheel(e)
          "
          @touchstart.passive="
            (e: TouchEvent) =>
              isCompactMobileGuild && onCompactVoiceTouchStart(e)
          "
          @touchend.passive="
            (e: TouchEvent) => isCompactMobileGuild && onCompactVoiceTouchEnd(e)
          "
        >
          <button
            v-if="
              !isCompactMobileGuild &&
              channelPanelCollapsed &&
              expandChannels &&
              !vcActivitySurfaceOpen &&
              !stageShowLobby
            "
            type="button"
            class="absolute left-3 top-3 z-[45] inline-flex h-9 items-center gap-1.5 rounded-xl bg-scrim-2 px-2.5 text-xs font-semibold text-fg-soft backdrop-blur-sm transition hover:bg-scrim-2"
            aria-label="Back to channels"
            title="Back to channels"
            @click="expandChannels()"
          >
            <img
              :src="icons.arrowLeft"
              alt=""
              class="h-3.5 w-3.5 brightness-0 invert"
            />
            <span>Back</span>
          </button>
          <button
            v-if="
              isCompactMobileGuild && !vcActivitySurfaceOpen && !stageShowLobby
            "
            type="button"
            class="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+0.45rem)] z-[45] inline-flex h-9 items-center gap-1.5 rounded-xl bg-scrim-2 px-2.5 text-xs font-semibold text-fg-soft backdrop-blur-sm transition hover:bg-scrim-2"
            aria-label="Back to channels"
            @click="onMobileBackToChannels?.()"
          >
            <img
              :src="icons.arrowLeft"
              alt=""
              class="h-3.5 w-3.5 brightness-0 invert"
            />
            <span>Back</span>
          </button>
          <StageVcLobby
            v-if="stageShowLobby && voiceUiChannel"
            :key="`stage-lobby:${voiceUiChannel.id}`"
            class="min-w-0 min-h-0 flex-1"
            :channel-name="getChannelDisplayName(voiceUiChannel.name)"
            :stage-channel-id="voiceUiChannel.id"
            :echo-server-id="selectedServerId"
            :can-manage-stage="canManageStage"
            :planning-event="stagePlanningEvent"
            :upcoming-events="stageUpcomingEvents"
            :now-ms="stageLobbyNowMs"
            @start-voice-only="onStageLobbyVoiceOnly"
            @start-planned-event="onStageLobbyPlanned"
            @schedule-event="onStageLobbySchedule"
            @youtube-live-started="onStageLobbyYoutubeLiveStarted"
          />
          <VcActivityStage
            v-else-if="vcActivitySurfaceOpen && !isStageChannel"
            :key="`vc-activity:${voiceUiChannel?.id ?? 'none'}`"
            class="min-w-0 min-h-0 flex-1"
            :state="vcActivityUi"
            :voice-channel-label="voiceChannelActivityLabel"
            :compact-layout="isCompactMobileGuild"
            :channel-panel-collapsed="!!channelPanelCollapsed"
            :expand-channels="expandChannels"
            :on-mobile-back-to-channels="onMobileBackToChannels"
            :is-compact-shell="!!isCompactShell"
            :narrow-channel-panel-for-activity-overflow-step="
              narrowChannelPanelForActivityOverflowStep
            "
            :voice-side-chat-collapsed="voiceSideChatCollapsed"
            :expand-voice-side-chat="expandVoiceSideChat"
            :open-vc-activity-youtube-browse="openVcActivityYoutubeBrowse"
            :open-vc-activity-wordle="openVcActivityWordle"
            :open-vc-activity-hangman="openVcActivityHangman"
            :open-vc-activity-skriggles="openVcActivitySkriggles"
            :open-vc-activity-tic-tac-toe="openVcActivityTicTacToe"
            :open-vc-activity-open-guessr="openVcActivityOpenGuessr"
            :open-vc-activity-skribbl-io="openVcActivitySkribblIo"
            :open-vc-activity-gartic-phone="openVcActivityGarticPhone"
            :open-vc-activity-krunker="openVcActivityKrunker"
            :open-vc-activity-codenames="openVcActivityCodenames"
            :open-vc-activity-richup="openVcActivityRichup"
            :open-vc-activity-goober-dash="openVcActivityGooberDash"
            :open-vc-activity-smash-karts="openVcActivitySmashKarts"
            :open-vc-activity-cluster-rush="openVcActivityClusterRush"
            :open-vc-activity-picker="openVcActivityPicker"
            :set-vc-activity-youtube-video="setVcActivityYoutubeVideo"
            :set-vc-youtube-browse-open="setVcYoutubeBrowseOpen"
            :add-vc-youtube-to-queue="addVcYoutubeToQueue"
            :remove-vc-youtube-from-queue="removeVcYoutubeFromQueue"
            :move-vc-youtube-in-queue="moveVcYoutubeInQueue"
            :play-vc-youtube-at-index="playVcYoutubeAtIndex"
            :play-vc-youtube-next="playVcYoutubeNext"
            :play-vc-youtube-previous="playVcYoutubePrevious"
            :close-vc-activity="closeVcActivity"
            :publish-vc-youtube-playback-sync="publishVcYoutubePlaybackSync"
            :vc-youtube-remote-playback="vcYoutubeRemotePlayback"
            :vc-youtube-playback-should-publish="vcYoutubePlaybackShouldPublish"
            :vc-hangman-activity="vcHangmanActivity"
            :hangman-roster-user-ids="hangmanRosterUserIds"
            :commit-vc-hangman-word="commitVcHangmanWord"
            :request-vc-hangman-guess-letter="requestVcHangmanGuessLetter"
            :request-vc-hangman-next-round="requestVcHangmanNextRound"
            :vc-skriggles-activity="vcSkrigglesActivity"
            :skriggles-roster-user-ids="skrigglesRosterUserIds"
            :skriggles-canvas-events="skrigglesCanvasEvents"
            :commit-skriggles-word-choice="commitSkrigglesWordChoice"
            :submit-skriggles-guess="submitSkrigglesGuess"
            :update-skriggles-settings="updateSkrigglesSettings"
            :start-skriggles-game="startSkrigglesGame"
            :advance-skriggles-round="advanceSkrigglesRound"
            :publish-skriggles-stroke-batch="publishSkrigglesStrokeBatch"
            :publish-skriggles-canvas-cmd="publishSkrigglesCanvasCmd"
            :publish-skriggles-canvas-snapshot="publishSkrigglesCanvasSnapshot"
            :tick-skriggles-timers="tickSkrigglesTimers"
            :vc-tic-tac-toe-activity="vcTicTacToeActivity"
            :vc-tic-tac-toe-pending-invite="vcTicTacToePendingInvite"
            :send-vc-tic-tac-toe-challenge="sendVcTicTacToeChallenge"
            :respond-vc-tic-tac-toe-invite="respondVcTicTacToeInvite"
            :dismiss-vc-tic-tac-toe-invite="dismissVcTicTacToeInvite"
            :request-vc-tic-tac-toe-move="requestVcTicTacToeMove"
            :request-vc-tic-tac-toe-rematch="requestVcTicTacToeRematch"
            :live-kit-connected="liveKitConnected"
            :vc-codenames-activity="vcCodenamesActivity"
            :codenames-roster-user-ids="codenamesRosterUserIds"
            :vc-codenames-spymaster-key="vcCodenamesSpymasterKey"
            :commit-vc-codenames-deal="commitVcCodenamesDeal"
            :request-vc-codenames-setup="requestVcCodenamesSetup"
            :request-vc-codenames-clue="requestVcCodenamesClue"
            :request-vc-codenames-reveal="requestVcCodenamesReveal"
            :request-vc-codenames-end-turn="requestVcCodenamesEndTurn"
            :request-vc-codenames-new-game="requestVcCodenamesNewGame"
            :request-vc-codenames-push-key-to-orchestrator="
              requestVcCodenamesPushKeyToOrchestrator
            "
            :active-voice-channel-participants="activeVoiceChannelParticipants"
            :current-user-id="currentUserId"
            :focus-guild-voice-channel-in-sidebar="
              focusGuildVoiceChannelInSidebar
            "
          />
          <StageCallView
            v-else-if="isStageChannel && voiceUiChannel"
            :key="`stage-call:${voiceUiChannel.id}`"
            class="min-w-0 min-h-0 flex-1"
            :compact-layout="isCompactMobileGuild"
            :channel-name="getChannelDisplayName(voiceUiChannel.name)"
            :stage-channel-id="voiceUiChannel.id"
            :echo-server-id="selectedServerId"
            :active-stage-event="stageActiveStageEvent"
            :stage-event-now-ms="stageLobbyNowMs"
            :prompt-youtube-live-for-event="stageEventPromptYoutubeLive"
            :stage-event-started-from-lobby="stageEventStartedFromLobby"
            :can-manage-stage-youtube="canManageStage"
            @dismiss-stage-event="onDismissStageEventBanner"
            @dismiss-youtube-live-prompt="onDismissYoutubeLivePrompt"
            :participants="activeVoiceChannelParticipants"
            :stage-speaker-by-user-id="stageSpeakerByUserId"
            :current-user-id="currentUserId"
            :on-open-profile="handleCallViewOpenProfile"
            :can-moderate-participant="canModerateVcParticipant"
            :can-vc-moderate-participant-action="canVcModerateParticipantAction"
            :on-vc-moderate="handleVcModerate"
            :remote-participants="remoteParticipants"
            :lk-room="lkRoom"
            :mirror-local-camera="mirrorLocalCamera"
            :get-local-screen-track="getLocalScreenTrack"
            :get-local-camera-track="getLocalCameraTrack"
            :on-go-to-voice-channel-in-sidebar="focusGuildVoiceChannelInSidebar"
            :voice-channel-user-limit="voiceUiChannel.userLimit"
          />
          <CallView
            v-else
            :key="`call:${voiceUiChannel?.id ?? 'none'}`"
            class="min-w-0 min-h-0 flex-1"
            :compact-layout="isCompactMobileGuild"
            :channel-name="
              voiceUiChannel ? getChannelDisplayName(voiceUiChannel.name) : ''
            "
            :participants="activeVoiceChannelParticipants"
            :current-user-id="currentUserId"
            :on-open-profile="handleCallViewOpenProfile"
            :can-moderate-participant="canModerateVcParticipant"
            :can-vc-moderate-participant-action="canVcModerateParticipantAction"
            :on-vc-moderate="handleVcModerate"
            :remote-participants="remoteParticipants"
            :lk-room="lkRoom"
            :mirror-local-camera="mirrorLocalCamera"
            :get-local-screen-track="getLocalScreenTrack"
            :get-local-camera-track="getLocalCameraTrack"
            :get-remote-participant-volume="getRemoteParticipantVolume"
            :set-remote-participant-volume="setRemoteParticipantVolume"
            :on-request-fullscreen-stream="onRequestFullscreenStream"
            :voice-moderation-channel-id="
              voiceUiChannel?.type === 'voice' ||
              voiceUiChannel?.type === 'stage'
                ? voiceUiChannel.id
                : null
            "
            :on-go-to-voice-channel-in-sidebar="focusGuildVoiceChannelInSidebar"
            :voice-channel-user-limit="
              voiceUiChannel?.type === 'voice' ||
              voiceUiChannel?.type === 'stage'
                ? voiceUiChannel.userLimit
                : undefined
            "
          />
        </div>
        <template v-if="!isCompactMobileGuild">
          <!-- v-show (not v-if): toggling voice side chat must not destroy ChatView/MessageList — remount was a major jank spike. -->
          <div
            v-show="!voiceSideChatCollapsed"
            class="voice-side-chat-column relative flex min-h-0 min-w-0 shrink-0 flex-col items-stretch self-stretch bg-surface"
            :style="{ width: voiceSideChatWidth + 8 + 'px' }"
          >
            <!-- Hit target only: was a flex sibling (`w-2`) which left an un-painted strip beside the header. -->
            <div
              class="absolute inset-y-0 left-0 z-[40] w-2 cursor-col-resize"
              aria-label="Resize voice chat"
              @mousedown="startVoiceSideChatResize"
              @dblclick="resetVoiceSideChatWidth"
            />
            <div
              class="voice-side-chat-header flex h-11 w-full min-w-0 max-w-full shrink-0 items-center justify-start gap-2 self-stretch pl-5 pr-3 sm:pl-6 sm:pr-4"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-glass-1"
              >
                <img
                  v-if="!voiceSideChatEmoji"
                  :src="voiceSideChatIconUrl"
                  alt=""
                  class="h-4 w-4 opacity-80 filter invert"
                />
                <span
                  v-else
                  class="h-4 w-4 flex items-center justify-center text-[14px] leading-none opacity-80"
                  aria-hidden="true"
                  >{{ voiceSideChatEmoji }}</span
                >
              </span>
              <span
                class="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-wide text-fg-soft"
                >{{ voiceSideChatTitle }}</span
              >
              <button
                type="button"
                class="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg-soft"
                aria-label="Close voice chat"
                title="Close voice chat"
                @click="toggleVoiceSideChat"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div
              class="ml-2 flex min-h-0 min-w-0 flex-1 flex-col"
              :style="{ width: voiceSideChatWidth + 'px' }"
            >
              <ChatView
                class="min-w-0 min-h-0 flex-1"
                :active-channel="effectiveActiveChannel"
                :active-channel-messages="activeChannelMessagesMap"
                :server-id="selectedServerId"
                :users="users"
                :channels="allChannels"
                :send-message="sendMessage"
                :on-request-forward="onRequestForward"
                :can-show-discord-channel-import="canShowDiscordChannelImport"
                :current-user-id="currentUserId"
                :linked-discord-user-id="linkedDiscordUserId ?? null"
                :current-user-name="currentUserName"
                :current-user-pfp="currentUserPfp"
                :pinned-message-ids="[]"
                :on-poll-vote="handlePollVote"
                :on-save-edit="editMessage"
                :on-delete="deleteMessage"
                :on-react="handleReact"
                :top-reactions="topReactions"
                :remove-reaction-favorite="removeReactionFavorite"
                :on-go-to-channel="handleGoToChannel"
                :on-go-to-message="handleGoToMessage"
                :on-open-profile="openMemberProfile"
                :can-moderate-author="canModerateAuthor"
                :on-moderate-user="handleModerateUser"
                :show-input-for-voice-channel="true"
                :compact-top="true"
                :show-nsfw-gate="showNsfwChatGate"
                :on-nsfw-acknowledge="acknowledgeNsfwChannel"
                :on-nsfw-decline="declineNsfwGate"
              />
            </div>
          </div>
        </template>

        <!-- Mobile: bottom chat sheet — v-show keeps ChatView mounted when collapsed (see desktop comment). -->
        <div
          v-else
          v-show="!voiceSideChatCollapsed"
          class="voice-mobile-chat-sheet pointer-events-none absolute inset-x-0 z-[35] flex flex-col items-stretch justify-end"
          :style="voiceMobileSheetBottomStyle"
        >
          <div
            class="pointer-events-auto flex flex-col overflow-hidden rounded-t-2xl border border-border border-b-0 bg-elevated voice-mobile-chat-sheet__panel"
            :class="mobileSheetFrameClass"
          >
            <div
              class="flex w-full flex-col items-center px-3 pt-2 pb-1.5"
              aria-hidden="true"
            >
              <span class="h-1 w-10 shrink-0 rounded-full bg-glass-active" />
            </div>
            <div
              class="voice-side-chat-header voice-side-chat-header--mobile flex w-full min-w-0 max-w-full shrink-0 items-center justify-start gap-2 self-stretch px-3 pb-2"
              @wheel.passive="onSheetChromeWheel"
              @touchstart.passive="onSheetChromeTouchStart"
              @touchend.passive="onSheetChromeTouchEnd"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-glass-1"
              >
                <img
                  v-if="!voiceSideChatEmoji"
                  :src="voiceSideChatIconUrl"
                  alt=""
                  class="h-4 w-4 opacity-80 filter invert"
                />
                <span
                  v-else
                  class="flex h-4 w-4 items-center justify-center text-[14px] leading-none opacity-80"
                  aria-hidden="true"
                  >{{ voiceSideChatEmoji }}</span
                >
              </span>
              <span
                class="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg-soft"
                >{{ voiceSideChatTitle }}</span
              >
              <button
                type="button"
                class="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg-soft"
                aria-label="Close voice chat"
                title="Close voice chat"
                @click="toggleVoiceSideChat"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ChatView
              class="min-h-0 min-w-0 flex-1"
              :active-channel="effectiveActiveChannel"
              :active-channel-messages="activeChannelMessagesMap"
              :server-id="selectedServerId"
              :users="users"
              :mention-users="mentionUsers"
              :channels="allChannels"
              :send-message="sendMessage"
              :on-request-forward="onRequestForward"
              :can-show-discord-channel-import="canShowDiscordChannelImport"
              :current-user-id="currentUserId"
              :linked-discord-user-id="linkedDiscordUserId ?? null"
              :current-user-name="currentUserName"
              :current-user-pfp="currentUserPfp"
              :pinned-message-ids="[]"
              :on-poll-vote="handlePollVote"
              :on-save-edit="editMessage"
              :on-delete="deleteMessage"
              :on-react="handleReact"
              :top-reactions="topReactions"
              :remove-reaction-favorite="removeReactionFavorite"
              :on-go-to-channel="handleGoToChannel"
              :on-go-to-message="handleGoToMessage"
              :on-open-profile="openMemberProfile"
              :can-moderate-author="canModerateAuthor"
              :on-moderate-user="handleModerateUser"
              :show-input-for-voice-channel="true"
              :compact-top="true"
              :show-nsfw-gate="showNsfwChatGate"
              :on-nsfw-acknowledge="acknowledgeNsfwChannel"
              :on-nsfw-decline="declineNsfwGate"
            />
          </div>
        </div>
      </div>
    </div>
    <StageEventScheduleModal
      v-if="isStageChannel && voiceUiChannel"
      :open="stageScheduleModalOpen"
      :server-id="selectedServerId"
      :stage-channel-id="voiceUiChannel.id"
      :stage-channel-name="getChannelDisplayName(voiceUiChannel.name)"
      @close="stageScheduleModalOpen = false"
      @created="stageScheduleModalOpen = false"
    />
  </template>
</template>

<style scoped lang="scss">
.voice-side-chat-header {
  /* Match `.chat-header-glass`: glass tint + blur only — drop shadows read as a mis-sized
     strip and clip badly against the voice column edge. */
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  background-color: var(
    --chat-glass-header-bg-fallback,
    var(--chat-glass-header-bg)
  );
  isolation: isolate;
  border-bottom: none;
  box-shadow: none;
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .voice-side-chat-header {
    background-color: var(--chat-glass-header-bg);
    backdrop-filter: var(--chat-glass-header-backdrop);
    -webkit-backdrop-filter: var(--chat-glass-header-backdrop);
  }
}

.voice-side-chat-header--mobile {
  min-height: 2.5rem;
}

/* Touch: lighter shadow (less GPU blur work) + crisper edge than 40px spread */
.voice-mobile-chat-sheet__panel {
  box-shadow: 0 -6px 28px color-mix(in srgb, black 38%, transparent);
}

.voice-chat-reopen-action {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-elevated) 90%, white 2%) 0%,
    color-mix(in srgb, var(--bg-elevated) 96%, black 4%) 100%
  );
  box-shadow:
    0 12px 26px color-mix(in srgb, black 36%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.voice-chat-reopen-action:hover {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-elevated) 86%, white 5%) 0%,
    color-mix(in srgb, var(--bg-elevated) 94%, black 6%) 100%
  );
  border-color: color-mix(in srgb, #7dd3fc 32%, var(--border));
}

.voice-chat-reopen-action:focus-visible {
  outline: 2px solid color-mix(in srgb, #7dd3fc 60%, white 12%);
  outline-offset: 2px;
}

/* Sunny: warm lift + amber focus (default light uses sky blue + grey-black shadows). */
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .voice-mobile-chat-sheet__panel {
  box-shadow: 0 -6px 28px rgba(120, 80, 30, 0.12);
}

:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .voice-chat-reopen-action {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 91%, white 4%) 0%,
    color-mix(in srgb, var(--surface) 93%, var(--border) 7%) 100%
  );
  box-shadow:
    0 12px 26px rgba(120, 80, 30, 0.11),
    inset 0 1px 0 color-mix(in srgb, white 50%, transparent);
}

:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .voice-chat-reopen-action:hover {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 87%, white 6%) 0%,
    color-mix(in srgb, var(--surface) 90%, var(--border) 10%) 100%
  );
  border-color: color-mix(in srgb, rgb(217, 119, 6) 32%, var(--border));
}

:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .voice-chat-reopen-action:focus-visible {
  outline: 2px solid color-mix(in srgb, rgb(217, 119, 6) 52%, white 14%);
}

.voice-chat-reopen-action--desktop {
  bottom: 1rem;
}

.voice-chat-reopen-action--mobile {
  bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
}

@media (max-width: 639px) {
  .voice-chat-reopen-action {
    font-size: 0.8125rem;
    padding: 0.45rem 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-mobile-chat-sheet__panel {
    box-shadow: 0 -2px 12px color-mix(in srgb, black 45%, transparent);
  }

  :global(html[data-theme='light'][data-echo-light-variant='sunny'])
    .voice-mobile-chat-sheet__panel {
    box-shadow: 0 -2px 12px rgba(120, 80, 30, 0.14);
  }
}
</style>
