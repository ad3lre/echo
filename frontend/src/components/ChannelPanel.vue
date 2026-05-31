<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onMounted,
  provide,
  ref,
  toRef,
  unref,
  watch,
  type Ref,
} from 'vue';
import { storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/stores/devSettings';
import { useEchoSessionStore } from '@/stores/echoSession';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import {
  linkTokenChannel,
  linkTokenServer,
  linkTokenUser,
} from '@/utils/idTokens';
import { requestAppConfirmFromContextMenu } from '@/utils/appDialogs';
import type { ChannelSummary } from '@shared/types';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';
import { getChannelDisplayName } from '@/assets/icons';
import { getPopoutAnchorRect } from '@/utils/memberProfiles';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import {
  useChannelPanelVoiceSettings,
  CHANNEL_PANEL_VOICE_SETTINGS_INJECTION_KEY,
} from '@/features/channel-panel/composables/useChannelPanelVoiceSettings';
import GuildVoiceConnectionStrip from '@/features/channel-panel/components/GuildVoiceConnectionStrip.vue';
import {
  useChannelPanelVoiceState,
  type ChannelCategory,
  type ChannelWithParticipants,
} from '@/features/channel-panel/composables/useChannelPanelVoiceState';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import { getServerNotificationSummary } from '@/features/server-notifications/types';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { shouldOfferLeaveServerInClientUi } from '@/utils/echoServerOwnership';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { requestGuildVoiceJoinNoPermissionModal } from '@/utils/guildVoiceJoinBlockedDialog';
import {
  liveKitRemoteIdentities,
  liveKitRemoteParticipantByIdentity,
} from '@/services/livekit/liveKitRoomParticipants';
import type { CreateChannelModalSubmitPayload } from '@/components/CreateChannelModal.vue';
import { channelPanelDiag } from '@/utils/channelPanelDiag';
import { layoutHyperLog } from '@/utils/layoutHyperLog';

import ChannelPanelHeader from '@/features/channel-panel/components/ChannelPanelHeader.vue';
import ChannelPanelList from '@/features/channel-panel/components/ChannelPanelList.vue';
import { CHANNEL_PANEL_SKELETON_SECTIONS } from '@/features/channel-panel/channelPanelListSkeleton';
import ChannelPanelContextMenu from '@/features/channel-panel/components/ChannelPanelContextMenu.vue';
import ServerEventsCarousel from '@/features/channel-panel/components/ServerEventsCarousel.vue';
import PaperEditorPanel from '@/features/paper/components/PaperEditorPanel.vue';
import { usePaperEditorPanelBridge } from '@/features/paper/composables/paperEditorPanelBridge';
import { useChannelHoverMessagePrefetch } from '@/services/orchestration/useChannelHoverMessagePrefetch';

/** Quick self-dismissing shell toasts for channel panel context menu actions. */
const PANEL_MENU_ACTION_TOAST_MS = 2400;

function toastPanelMenuAction(message: string) {
  dispatchAppToastDetail({
    message,
    durationMs: PANEL_MENU_ACTION_TOAST_MS,
  });
}

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);
const echoSession = useEchoSessionStore();
const { upcomingEventsByServerId } = storeToRefs(echoSession);
const workspace = useEchoWorkspace();
const channelPanelRef = ref<HTMLElement | null>(null);

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );
const showVcMentionInChat = computed(() => !!composerInsertUserMention?.value);

const channelPanelVoiceSettings = useChannelPanelVoiceSettings();
provide(CHANNEL_PANEL_VOICE_SETTINGS_INJECTION_KEY, channelPanelVoiceSettings);
const { closeVcSettings } = channelPanelVoiceSettings;

const props = defineProps<{
  selectedServer: {
    id: string;
    name: string;
    imageUrl: string;
    bannerImageUrl?: string;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    ownerId?: string;
  } | null;
  categories: ChannelCategory[] | import('vue').Ref<ChannelCategory[]>;
  users: { id: string; name: string; pfp: string }[];
  activeChannelId: string;
  collapsed: boolean;
  /** When true, show icon-only bubble view for narrow panels */
  bubbleMode?: boolean;
  loading?: boolean;
  currentUserId?: string;
  currentUser?: { id: string; name: string; pfp: string };
  currentVoiceChannelId?: string | null;
  currentVoiceChannelName?: string;
  /** Jump to owning guild and highlight this VC in the channel list. */
  focusGuildVoiceChannelInSidebar?: () => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
  /** VC participant context menu → full expanded profile (not quick popout). */
  onOpenProfileFromContextMenu?: (userId: string) => void;
  openProfileUserId?: string | null;
  /** VC control state (controlled from parent so CallView can show same state). */
  vcMuted?: boolean;
  vcDeafened?: boolean;
  vcVideo?: boolean;
  vcScreenshare?: boolean;
  canUseVideo?: boolean;
  canJoinVoice?: (channelId: string) => boolean;
  resizeHandlers?: {
    onResizeStart: (e: MouseEvent) => void;
    onReset: () => void;
  };
  /** Voice side chat collapsed (for chat toggle button state) */
  sideChatCollapsed?: boolean;
  /** When true, show + on categories and “Create Channel” in server menu (mock admin). */
  canCreateChannels?: boolean;
  /** Echo: drag-reorder channels (MANAGE_CHANNELS); no-op if omitted. */
  handleChannelReorder?: (payload: {
    channelId: string;
    targetCategoryId: string | null;
    siblingIndex: number;
  }) => void | Promise<void>;
  /** Echo: drag-reorder categories (MANAGE_CHANNELS); no-op if omitted. */
  handleCategoryReorder?: (payload: {
    categoryId: string;
    siblingIndex: number;
  }) => void | Promise<void>;
  /** Per-channel channel settings (gear, context menu); Echo uses effective MANAGE_CHANNELS. */
  canManageThisChannel?: (channel: ChannelSummary) => boolean;
  /** When true, show invite entry points (Echo: CREATE_INVITE). Omitted/false hides them. */
  canInvite?: boolean;
  /** When false, hide “Server Settings” in the server header menu (no manage-server / manage-roles). */
  showServerSettingsMenuItem?: boolean;
  /** Per-server notification override for the current server (mock). */
  serverNotificationLevel?: ServerNotificationLevel;
  /** Server moderation (member list / VC participant menus). */
  canModerateUser?: (userId: string) => boolean;
  /** Per-action voice moderation (Echo: MUTE_MEMBERS / DEAFEN_MEMBERS / MOVE_MEMBERS). */
  canVcModerateMember?: (
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
  onModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  onVcModerate?: (payload: {
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
  onMessageUser?: (userId: string) => void;
  liveKitState?: 'idle' | 'connecting' | 'connected' | 'error';
  liveKitNetworkStats?: {
    latencyMs: number;
    jitterMs: number;
    packetLossPct: number;
    bitrateKbps: number;
    codec: string;
    serverRegion?: string;
  } | null;
  liveKitRoom?: unknown;
  /** 0–1 local mic level for VC panel input meter (compact). */
  vcMicInputLevel?: number;
  onSwitchCamera?: (deviceId: string) => void;
  /**
   * When joined to a voice channel, same participant rows as CallView (LiveKit speaking / levels).
   * Used for inline VC avatars in the channel list when `channelId === currentVoiceChannelId`.
   */
  voiceSessionParticipants?: Array<{
    id: string;
    muted: boolean;
    deafened: boolean;
    streaming: boolean;
    video: boolean;
    serverMuted: boolean;
    serverDeafened: boolean;
    speaking?: boolean;
    audioLevel?: number;
  }>;
  /** VC activity roster badges (YouTube, activities picker). */
  getVcActivityPresence?: (userId: string) => VcActivityPresenceKind[];
  /** User id hosting synced VC activity (YouTube / games); crown on roster + CallView. */
  vcActivityKingUserId?: string | null;
  /**
   * When false, hide the bottom voice connection panel (mute / deafen / device settings).
   * CallView is gallery + side chat only — keep this true for server VC so transport controls stay in the channel list.
   * DM calls on the servers rail reuse this strip (merged id/state from layout); on the DM rail, controls stay in the chat header / call view.
   */
  showVoiceConnectionPanel?: boolean;
  /** Per-user output volume for VC list context menu (LiveKit; same as CallView). */
  getRemoteParticipantVolume?: (userId: string) => number;
  setRemoteParticipantVolume?: (userId: string, volumePercent: number) => void;
  /** From attention: guild text channels with unread (for compact brighter labels). */
  channelMissedActivityByChannelId?: Record<string, true>;
  /** Compact shell: tapping a VC opens the lobby sheet instead of joining immediately. */
  mobileVoiceChannelTapOpensLobby?: boolean;
  /** Highlights the VC row while the lobby targets this channel id. */
  voiceLobbyChannelId?: string | null;
}>();

const upcomingServerEvents = computed(() => {
  const sid = props.selectedServer?.id?.trim();
  if (!sid || sid === 'echo') return [];
  return upcomingEventsByServerId.value[sid] ?? [];
});

const showServerSettingsMenuItem = computed(
  () => props.showServerSettingsMenuItem !== false,
);
const canInvite = computed(() => props.canInvite === true);

const showVoiceConnectionPanel = computed(
  () => props.showVoiceConnectionPanel !== false,
);

const canLeaveSelectedServer = computed(() => {
  const s = props.selectedServer;
  if (!s) return false;
  return shouldOfferLeaveServerInClientUi(
    s,
    props.currentUserId,
    devModeIdsEnabled.value,
  );
});

function copyServerIdFromServerMenu() {
  const s = props.selectedServer;
  if (!s || s.id === 'echo') return;
  copyToClipboard(linkTokenServer(s.id));
}

function rowCanManageChannel(ch: ChannelSummary): boolean {
  return props.canManageThisChannel
    ? props.canManageThisChannel(ch)
    : !!props.canCreateChannels;
}

const canReorderChannels = computed(() => {
  if (!props.canCreateChannels) return false;
  if (props.selectedServer?.id === 'echo') return false;
  return typeof props.handleChannelReorder === 'function';
});

const canReorderCategories = computed(() => {
  if (!props.canCreateChannels) return false;
  if (props.selectedServer?.id === 'echo') return false;
  return typeof props.handleCategoryReorder === 'function';
});

function onChannelReorder(payload: {
  channelId: string;
  targetCategoryId: string | null;
  siblingIndex: number;
}) {
  props.handleChannelReorder?.(payload);
}

function onCategoryReorder(payload: {
  categoryId: string;
  siblingIndex: number;
}) {
  props.handleCategoryReorder?.(payload);
}

function getUserById(id: string) {
  return props.users.find((u) => u.id === id);
}

/** SFU-only identities (workspace snapshot lag) still need a row label in the channel tree. */
function voiceParticipantLabel(channelId: string, userId: string) {
  const u = props.users.find((x) => x.id === userId);
  if (u?.name?.trim()) return u.name;
  if (
    props.liveKitState === 'connected' &&
    (props.currentVoiceChannelId ?? '') === channelId &&
    props.liveKitRoom
  ) {
    const room = props.liveKitRoom as import('livekit-client').Room;
    const rp = liveKitRemoteParticipantByIdentity(room, userId);
    const n = rp?.name?.trim();
    if (n) return n;
  }
  return undefined;
}

const serverNotificationBannerText = computed(() => {
  const lvl = props.serverNotificationLevel;
  if (!lvl || lvl === 'all' || lvl === 'mentions') return '';
  return getServerNotificationSummary(lvl);
});

/** Channel row being hovered (for showing VC buttons vs count). */
const hoveredChannelId = ref<string | null>(null);

function findVoiceChannelRowInProps(
  channelId: string,
): ChannelWithParticipants | null {
  const cats = unref(props.categories) as ChannelCategory[];
  if (!cats?.length) return null;
  for (const cat of cats) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return ch as ChannelWithParticipants;
  }
  return null;
}

/** Server mute/deafen for VC ordering when LiveKit rows are missing (matches `participantVoiceUi`). */
function getServerVoiceModerationForUser(userId: string) {
  const vcId = props.currentVoiceChannelId;
  if (!vcId) return { serverMuted: false, serverDeafened: false };
  const row = findVoiceChannelRowInProps(vcId);
  const echoMute = row?.voiceServerMuteByUserId?.[userId];
  const echoDeaf = row?.voiceServerDeafenByUserId?.[userId];
  const mockMute = workspace.vcServerMuteByChannel.value[vcId]?.[userId];
  const mockDeaf = workspace.vcServerDeafenByChannel.value[vcId]?.[userId];
  return {
    serverMuted: !!echoMute || !!mockMute,
    serverDeafened: !!echoDeaf || !!mockDeaf,
  };
}

const { getVoiceParticipantState, effectiveCategories } =
  useChannelPanelVoiceState({
    categories: computed(() => props.categories as ChannelCategory[]),
    getCurrentVoiceChannelId: () => props.currentVoiceChannelId,
    getCurrentUserId: () => props.currentUserId,
    users: computed(() => props.users),
    getVcMuted: () => props.vcMuted,
    getVcDeafened: () => props.vcDeafened,
    getVcVideo: () => props.vcVideo,
    getVcScreenshare: () => props.vcScreenshare,
    getLiveVoiceParticipants: () => props.voiceSessionParticipants ?? null,
    getServerVoiceModerationForUser,
    getLiveKitVoiceFilter: () => {
      if (props.liveKitState !== 'connected') return null;
      const vid = props.currentVoiceChannelId;
      const uid = props.currentUserId;
      if (!vid?.trim() || !uid) return null;
      const room = props.liveKitRoom as
        | import('livekit-client').Room
        | undefined;
      const keys = room?.remoteParticipants?.size
        ? liveKitRemoteIdentities(room)
        : [];
      return { channelId: vid, remoteIdentities: keys, currentUserId: uid };
    },
  });

function findVoiceChannelById(
  channelId: string,
): ChannelWithParticipants | null {
  for (const cat of effectiveCategories.value) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return ch as ChannelWithParticipants;
  }
  return null;
}

function findChannelById(channelId: string) {
  for (const cat of effectiveCategories.value) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return ch;
  }
  return null;
}

useChannelHoverMessagePrefetch({
  hoveredChannelId,
  activeChannelId: toRef(props, 'activeChannelId'),
  isPrefetchableTextChannel: (channelId) =>
    findChannelById(channelId)?.type === 'text',
});

const paperPanelBridge = usePaperEditorPanelBridge();

const activePaperChannel = computed(() => {
  const ch = findChannelById(props.activeChannelId);
  return ch?.type === 'paper' ? ch : null;
});

const paperEditorReady = computed(
  () =>
    !!activePaperChannel.value &&
    paperPanelBridge.registeredContext.value?.channelId ===
      props.activeChannelId,
);

const showPaperEditorPanel = computed(
  () => paperEditorReady.value && paperPanelBridge.panelOpen.value,
);

function togglePaperEditorPanel() {
  if (!paperEditorReady.value) return;
  paperPanelBridge.togglePanel();
}

watch(paperEditorReady, (ready) => {
  if (!ready) paperPanelBridge.closePanel();
});

function countChannelsInCategories(cats: ChannelCategory[]) {
  let n = 0;
  for (const c of cats) n += c.channels?.length ?? 0;
  return n;
}

watch(
  () => ({
    loading: props.loading,
    selectedServerId: props.selectedServer?.id ?? null,
    categoriesLen:
      (props.categories as ChannelCategory[] | undefined)?.length ?? 0,
    channelsInPropsCategories: countChannelsInCategories(
      (props.categories as ChannelCategory[] | undefined) ?? [],
    ),
    effectiveCategoriesLen: effectiveCategories.value.length,
    channelsInEffective: countChannelsInCategories(effectiveCategories.value),
    collapsed: props.collapsed,
    usersLen: props.users?.length ?? 0,
  }),
  (v) => {
    channelPanelDiag('ChannelPanel:state', v as Record<string, unknown>);
    void nextTick(() => {
      const el = channelPanelRef.value;
      const br = el?.getBoundingClientRect();
      const listEl = el?.querySelector('.channel-list') as HTMLElement | null;
      const rowEls = el?.querySelectorAll('.channel-row');
      const emptyStateEl = el?.querySelector('[class*="text-sm"]');
      layoutHyperLog('ChannelPanel:dom', {
        clientW: el?.clientWidth ?? null,
        clientH: el?.clientHeight ?? null,
        scrollH: el?.scrollHeight ?? null,
        listClientH: listEl?.clientHeight ?? null,
        listScrollH: listEl?.scrollHeight ?? null,
        listChildCount: listEl?.children.length ?? null,
        channelRowCount: rowEls?.length ?? null,
        hasEmptyStateText:
          emptyStateEl?.textContent?.trim().slice(0, 80) ?? null,
        rect: br
          ? {
              x: Math.round(br.x),
              y: Math.round(br.y),
              w: Math.round(br.width),
              h: Math.round(br.height),
            }
          : null,
      });
    });
  },
  { flush: 'post', immediate: true },
);

onMounted(() => {
  void nextTick(() => {
    const el = channelPanelRef.value;
    const br = el?.getBoundingClientRect();
    layoutHyperLog('ChannelPanel:mounted', {
      clientW: el?.clientWidth ?? null,
      clientH: el?.clientHeight ?? null,
      rect: br
        ? {
            x: Math.round(br.x),
            y: Math.round(br.y),
            w: Math.round(br.width),
            h: Math.round(br.height),
          }
        : null,
    });
  });
});

function vcModAllowed(
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
): boolean {
  if (props.canVcModerateMember) {
    return props.canVcModerateMember(userId, action);
  }
  return props.canModerateUser?.(userId) ?? false;
}

/** VC row: local state + moderator server mute/deafen (same rules as CallView). */
function participantVoiceUi(channelId: string, userId: string) {
  const row = findVoiceChannelById(channelId);
  const echoMute = row?.voiceServerMuteByUserId?.[userId];
  const echoDeaf = row?.voiceServerDeafenByUserId?.[userId];
  const mockMute = workspace.vcServerMuteByChannel.value[channelId]?.[userId];
  const mockDeaf = workspace.vcServerDeafenByChannel.value[channelId]?.[userId];
  const serverMuted = !!echoMute || !!mockMute;
  const serverDeafened = !!echoDeaf || !!mockDeaf;

  const live =
    props.currentVoiceChannelId === channelId &&
    props.voiceSessionParticipants?.length
      ? props.voiceSessionParticipants.find((p) => p.id === userId)
      : undefined;

  if (live) {
    return {
      streaming: live.streaming,
      video: live.video,
      deafened: live.deafened,
      muted: live.muted,
      serverMuted: live.serverMuted,
      serverDeafened: live.serverDeafened,
      speaking: live.speaking,
      audioLevel: live.audioLevel ?? 0,
    };
  }

  const st = getVoiceParticipantState(userId);
  const deafened = st.deafened || serverDeafened;
  const muted = st.muted || serverMuted || serverDeafened;
  return { ...st, serverMuted, serverDeafened, deafened, muted };
}

const emit = defineEmits<{
  'update:activeChannelId': [id: string];
  'update:collapsed': [value: boolean];
  'update:vcMuted': [value: boolean];
  'update:vcDeafened': [value: boolean];
  'update:vcVideo': [value: boolean];
  'update:vcScreenshare': [value: boolean];
  'join-voice': [payload: { channelId: string; channelName: string }];
  'open-voice-lobby': [payload: { channelId: string; channelName: string }];
  'leave-voice': [];
  invite: [payload?: { voiceChannelId: string; voiceChannelName?: string }];
  'open-server-settings': [];
  'toggle-side-chat': [];
  /** `categoryId` null = open from server menu (pick category in modal). */
  'open-create-channel': [categoryId: string | null];
  'open-create-category': [];
  'open-channel-settings': [
    payload: { channel: ChannelSummary; categoryId: string },
  ];
  'open-category-settings': [categoryId: string];
  'delete-channel': [payload: { channelId: string }];
  'delete-category': [payload: { categoryId: string }];
  'open-notification-settings': [];
  /** Open user Settings on Voice & Video (from VC quick settings). */
  'open-voice-audio-settings': [];
  'leave-server': [serverId: string];
  'quick-create-submit': [payload: CreateChannelModalSubmitPayload];
  'mark-read': [channelId: string];
  'guild-event-rsvp': [
    payload: {
      serverId: string;
      eventId: string;
      status: 'going' | 'declined';
    },
  ];
  'open-guild-event-channel': [
    payload: {
      serverId: string;
      channelId?: string | null;
      customLocation?: string | null;
      eventId?: string;
    },
  ];
  'open-guild-event-detail': [
    payload: {
      serverId: string;
      eventId: string;
    },
  ];
}>();

function onChannelRowClick(channel: ChannelWithParticipants) {
  closeVcSettings();
  if (channel.type === 'voice' || channel.type === 'stage') {
    if (props.canJoinVoice && !props.canJoinVoice(channel.id)) {
      requestGuildVoiceJoinNoPermissionModal();
      return;
    }
    if (props.currentVoiceChannelId === channel.id) {
      emit('update:activeChannelId', channel.id);
      return;
    }
    if (props.mobileVoiceChannelTapOpensLobby) {
      if (
        props.currentVoiceChannelId &&
        props.currentVoiceChannelId !== channel.id
      ) {
        emit('leave-voice');
      }
      emit('open-voice-lobby', {
        channelId: channel.id,
        channelName: getChannelDisplayName(channel.name),
      });
      return;
    }
    // Do NOT emit 'leave-voice' here. handleJoinVoiceNavigation already tears
    // down the old LiveKit room inside liveKit.connect(). Emitting leave-voice
    // first fires an async voiceService.onLeaveVoice() that calls
    // liveKit.disconnect() → increments connectGeneration, which silently
    // aborts the new channel's connection mid-flight (stale-gen check).
    emit('join-voice', {
      channelId: channel.id,
      channelName: getChannelDisplayName(channel.name),
    });
    emit('update:activeChannelId', channel.id);
    return;
  }
  emit('update:activeChannelId', channel.id);
}

function handleOpenVcProfile(userId: string, event: MouseEvent | HTMLElement) {
  const row = (
    event instanceof HTMLElement ? event : event.currentTarget
  ) as HTMLElement | null;
  const anchorTarget =
    row?.querySelector('.vc-participant-avatar-wrap') ??
    row?.querySelector('.vc-participant-avatar') ??
    row;
  const rect = getPopoutAnchorRect(anchorTarget, 'vc-panel');
  if (!rect) {
    props.onOpenProfile?.(userId, null);
    return;
  }
  const panelRect = channelPanelRef.value?.getBoundingClientRect();
  if (panelRect) {
    const panelRight = panelRect.right;
    props.onOpenProfile?.(userId, {
      ...rect,
      left: panelRight,
      right: panelRight,
      width: 0,
    });
  } else {
    props.onOpenProfile?.(userId, rect);
  }
}

const {
  menuOpen,
  menuRef: _menuRef,
  menuPosition,
  openAtEvent,
  closeMenu,
} = useSimpleContextMenu();

type PanelContext =
  | {
      type: 'channel';
      channel: ChannelWithParticipants;
      categoryId: string;
      categoryName: string;
    }
  | { type: 'category'; categoryId: string; categoryName: string }
  | {
      type: 'vc';
      userId: string;
      channel: ChannelWithParticipants;
      categoryId: string;
      categoryName: string;
    };

const panelContext = ref<PanelContext | null>(null);

const channelMenuCanMarkRead = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'channel') return false;
  return !!props.channelMissedActivityByChannelId?.[c.channel.id];
});

watch(menuOpen, (open) => {
  if (!open) panelContext.value = null;
});

async function onChannelRowContextMenu(
  channel: ChannelWithParticipants,
  categoryId: string,
  categoryName: string,
  e: MouseEvent,
) {
  if (!props.selectedServer || props.selectedServer.id === 'echo') return;
  panelContext.value = { type: 'channel', channel, categoryId, categoryName };
  await openAtEvent(e);
}

async function onCategoryRowContextMenu(
  categoryId: string,
  categoryName: string,
  e: MouseEvent,
) {
  if (!props.selectedServer || props.selectedServer.id === 'echo') return;
  panelContext.value = { type: 'category', categoryId, categoryName };
  await openAtEvent(e);
}

async function onVcParticipantContextMenu(
  userId: string,
  channel: ChannelWithParticipants,
  categoryId: string,
  categoryName: string,
  e: MouseEvent,
) {
  if (!props.selectedServer || props.selectedServer.id === 'echo') return;
  e.stopPropagation();
  panelContext.value = {
    type: 'vc',
    userId,
    channel,
    categoryId,
    categoryName,
  };
  await openAtEvent(e);
}

function channelMenuOpenChannel() {
  const c = panelContext.value;
  if (!c || c.type !== 'channel') return;
  const ch = c.channel;
  closeMenu();
  onChannelRowClick(ch);
  toastPanelMenuAction(`Opened “${getChannelDisplayName(ch.name)}”.`);
}

function channelMenuCopyId() {
  const c = panelContext.value;
  if (!c || c.type !== 'channel') return;
  copyToClipboard(linkTokenChannel(c.channel.id));
  closeMenu();
  toastPanelMenuAction('Copied channel ID.');
}

function channelMenuCopyLink() {
  const c = panelContext.value;
  if (!c || c.type !== 'channel' || !props.selectedServer) return;
  const url = `${window.location.origin}/channels/${props.selectedServer.id}/${c.channel.id}`;
  copyToClipboard(url);
  closeMenu();
  toastPanelMenuAction('Copied channel link.');
}

function channelMenuMarkRead() {
  const c = panelContext.value;
  if (!c || c.type !== 'channel' || !channelMenuCanMarkRead.value) return;
  const channelId = c.channel.id;
  closeMenu();
  emit('mark-read', channelId);
}

function channelMenuChannelSettings() {
  const c = panelContext.value;
  if (!c || c.type !== 'channel') return;
  closeMenu();
  toastPanelMenuAction('Opening channel settings.');
  emit('open-channel-settings', {
    channel: c.channel,
    categoryId: c.categoryId,
  });
}

function channelMenuInvite() {
  const c = panelContext.value;
  closeMenu();
  if (
    c?.type === 'channel' &&
    (c.channel.type === 'voice' || c.channel.type === 'stage')
  ) {
    toastPanelMenuAction(
      `Opening invite for “${getChannelDisplayName(c.channel.name)}”.`,
    );
    emit('invite', {
      voiceChannelId: c.channel.id,
      voiceChannelName: getChannelDisplayName(c.channel.name),
    });
    return;
  }
  toastPanelMenuAction('Opening invite.');
  emit('invite');
}

function categoryMenuCopyName() {
  const c = panelContext.value;
  if (!c || c.type !== 'category') return;
  copyToClipboard(c.categoryName);
  closeMenu();
  toastPanelMenuAction(`Copied category name “${c.categoryName}”.`);
}

function categoryMenuCopyServerId() {
  if (!props.selectedServer) return;
  copyToClipboard(linkTokenServer(props.selectedServer.id));
  closeMenu();
  toastPanelMenuAction('Copied server ID.');
}

function categoryMenuCreateChannel() {
  const c = panelContext.value;
  if (!c || c.type !== 'category') return;
  const id = c.categoryId;
  closeMenu();
  toastPanelMenuAction('Opening create channel.');
  emit('open-create-channel', id);
}

function categoryMenuSettings() {
  const c = panelContext.value;
  if (!c || c.type !== 'category') return;
  const id = c.categoryId;
  closeMenu();
  toastPanelMenuAction('Opening category settings.');
  emit('open-category-settings', id);
}

async function channelMenuDelete() {
  const c = panelContext.value;
  if (!c || c.type !== 'channel') return;
  const id = c.channel.id;
  const label = c.channel.name;
  const ok = await requestAppConfirmFromContextMenu(closeMenu, {
    title: `Delete channel “${label}”?`,
    message:
      'This cannot be undone.\n\nAll messages in this channel will be removed from the mock.',
    confirmLabel: 'Delete channel',
    danger: true,
  });
  if (!ok) return;
  emit('delete-channel', { channelId: id });
}

async function categoryMenuDelete() {
  const c = panelContext.value;
  if (!c || c.type !== 'category') return;
  const id = c.categoryId;
  const label = c.categoryName;
  const n =
    effectiveCategories.value.find((cat) => cat.id === id)?.channels.length ??
    0;
  const ok = await requestAppConfirmFromContextMenu(closeMenu, {
    title: `Delete category “${label}”?`,
    message: `Delete this category and all ${n} channel${n === 1 ? '' : 's'} inside it? This cannot be undone.`,
    confirmLabel: 'Delete category',
    danger: true,
  });
  if (!ok) return;
  emit('delete-category', { categoryId: id });
}

function openVcProfileFromMenu() {
  const c = panelContext.value;
  if (!c || c.type !== 'vc') return;
  closeMenu();
  if (props.onOpenProfileFromContextMenu) {
    props.onOpenProfileFromContextMenu(c.userId);
    return;
  }
  const row = document.querySelector(
    `[data-vc-user-id="${c.userId}"]`,
  ) as HTMLElement | null;
  if (row) {
    handleOpenVcProfile(c.userId, row);
  } else {
    props.onOpenProfile?.(c.userId, null);
  }
}

function vcMenuMessage() {
  const c = panelContext.value;
  if (!c || c.type !== 'vc') return;
  const uid = c.userId;
  closeMenu();
  props.onMessageUser?.(uid);
}

function vcMenuMention() {
  const c = panelContext.value;
  if (!c || c.type !== 'vc') return;
  const fn = composerInsertUserMention?.value;
  const u = getUserById(c.userId);
  if (!fn || !u) return;
  closeMenu();
  fn({ userId: c.userId, displayName: u.name });
}

function vcMenuCopyUserId() {
  const c = panelContext.value;
  if (!c || c.type !== 'vc') return;
  copyToClipboard(linkTokenUser(c.userId));
  closeMenu();
  toastPanelMenuAction('Copied user ID.');
}

function vcModerateFromMenu(
  action:
    | 'serverMute'
    | 'serverDeafen'
    | 'disconnect'
    | 'inviteToSpeak'
    | 'moveToAudience'
    | 'stopCamera'
    | 'stopScreenShare',
) {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !props.onVcModerate) return;
  const uid = c.userId;
  closeMenu();
  props.onVcModerate({
    action,
    targetUserId: uid,
    contextVoiceChannelId: c.channel?.id,
  });
}

function vcMenuMovePick(targetChannelId: string) {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !props.onVcModerate) return;
  const uid = c.userId;
  closeMenu();
  props.onVcModerate({
    action: 'move',
    targetUserId: uid,
    targetChannelId,
    contextVoiceChannelId: c.channel?.id,
  });
}

function onVcParticipantDragMove(payload: {
  userId: string;
  fromChannelId: string;
  targetChannelId: string;
}) {
  if (!props.onVcModerate) return;
  props.onVcModerate({
    action: 'move',
    targetUserId: payload.userId,
    targetChannelId: payload.targetChannelId,
    contextVoiceChannelId: payload.fromChannelId,
  });
}

function canMoveVcParticipant(userId: string): boolean {
  return vcModAllowed(userId, 'move');
}

function vcModerateServerFromMenu(action: 'kick' | 'ban' | 'timeout') {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !props.onModerateUser) return;
  closeMenu();
  props.onModerateUser({
    action,
    targetUserId: c.userId,
    ...(action === 'timeout' ? { timeoutMinutes: 60 } : {}),
  });
}

const vcMenuCanMute = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId) return false;
  return vcModAllowed(c.userId, 'serverMute');
});

const vcMenuCanDeafen = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId) return false;
  return vcModAllowed(c.userId, 'serverDeafen');
});

const vcMenuCanDisconnect = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId) return false;
  return vcModAllowed(c.userId, 'disconnect');
});

const vcMenuCanMove = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId) return false;
  return vcModAllowed(c.userId, 'move');
});

const vcMenuIsStage = computed(() => {
  const c = panelContext.value;
  return !!(c && c.type === 'vc' && c.channel?.type === 'stage');
});

const vcMenuTargetIsSpeaker = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId || !c.channel) return false;
  return !!c.channel.voiceStageSpeakerByUserId?.[c.userId];
});

const vcMenuCanInviteToSpeak = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId || !vcMenuIsStage.value) return false;
  return vcModAllowed(c.userId, 'inviteToSpeak');
});

const vcMoveTargets = computed(() => {
  const c = panelContext.value;
  const sid = props.selectedServer?.id?.trim();
  if (!c || c.type !== 'vc' || !sid || sid === 'echo' || !c.channel?.id) {
    return [] as Array<{ id: string; name: string; disabled: boolean }>;
  }
  const currentId = c.channel.id;
  const cats = unref(props.categories);
  const out: Array<{ id: string; name: string; disabled: boolean }> = [];
  for (const cat of cats) {
    for (const ch of cat.channels) {
      if ((ch.type !== 'voice' && ch.type !== 'stage') || ch.id === currentId)
        continue;
      const name = getChannelDisplayName(ch.name);
      const disabled = props.canJoinVoice ? !props.canJoinVoice(ch.id) : false;
      out.push({ id: ch.id, name, disabled });
    }
  }
  return out;
});

const vcMenuServerMuted = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId || !c.channel) return false;
  return participantVoiceUi(c.channel.id, c.userId).serverMuted;
});

const vcMenuServerDeafened = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc' || !c.userId || !c.channel) return false;
  return participantVoiceUi(c.channel.id, c.userId).serverDeafened;
});

const vcContextShowVoiceMod = computed(() => {
  const c = panelContext.value;
  if (!c || c.type !== 'vc') return false;
  const cur = props.currentUserId;
  if (!cur || c.userId === cur) return false;
  return (
    vcMenuCanMute.value ||
    vcMenuCanDeafen.value ||
    vcMenuCanDisconnect.value ||
    vcMenuCanMove.value ||
    vcMenuCanInviteToSpeak.value
  );
});

const vcContextIsSelf = computed(() => {
  const c = panelContext.value;
  const cur = props.currentUserId;
  return !!(c && c.type === 'vc' && cur && c.userId === cur);
});

const vcContextTargetTimedOut = computed(() => {
  const c = panelContext.value;
  const sid = props.selectedServer?.id?.trim();
  if (!c || c.type !== 'vc' || !sid || sid === 'echo') return false;
  const epochMs = workspace.timeoutUntilByServerUser.value[sid]?.[c.userId];
  return (
    typeof epochMs === 'number' &&
    Number.isFinite(epochMs) &&
    epochMs > Date.now()
  );
});

function forwardInvite(payload?: {
  voiceChannelId: string;
  voiceChannelName?: string;
}) {
  emit('invite', payload);
}
</script>

<template>
  <nav
    ref="channelPanelRef"
    aria-label="Channels"
    class="channel-panel-wrapper group/channel flex flex-col relative min-w-0 min-h-0 overflow-hidden"
  >
    <div
      v-show="!collapsed"
      class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden"
    >
      <ChannelPanelHeader
        :selected-server="selectedServer"
        :can-invite="canInvite"
        :show-server-settings-menu-item="showServerSettingsMenuItem"
        :can-create-channels="!!canCreateChannels"
        :dev-mode-ids-enabled="devModeIdsEnabled"
        :can-leave-selected-server="canLeaveSelectedServer"
        :server-notification-banner-text="serverNotificationBannerText"
        @invite="forwardInvite"
        @open-server-settings="emit('open-server-settings')"
        @open-create-channel="(id) => emit('open-create-channel', id)"
        @open-create-category="emit('open-create-category')"
        @open-notification-settings="emit('open-notification-settings')"
        @copy-server-id="copyServerIdFromServerMenu"
        @leave-server="(id) => emit('leave-server', id)"
      />

      <ServerEventsCarousel
        v-if="
          selectedServer?.id &&
          selectedServer.id !== 'echo' &&
          upcomingServerEvents.some((e) => e.userRsvp !== 'declined')
        "
        :server-id="selectedServer.id"
        :events="upcomingServerEvents"
        @rsvp="
          emit('guild-event-rsvp', {
            serverId: selectedServer.id,
            eventId: $event.eventId,
            status: $event.status,
          })
        "
        @open-channel="
          emit('open-guild-event-channel', {
            serverId: selectedServer.id,
            eventId: $event.eventId,
            channelId: $event.channelId,
            customLocation: $event.customLocation,
          })
        "
        @open-detail="
          emit('open-guild-event-detail', {
            serverId: selectedServer.id,
            eventId: $event.eventId,
          })
        "
      />

      <div
        v-if="loading"
        class="channel-list custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-2 py-2"
        role="status"
        aria-live="polite"
        aria-label="Loading channel panel"
      >
        <div
          v-for="section in CHANNEL_PANEL_SKELETON_SECTIONS"
          :key="section.key"
          class="mb-3"
          aria-hidden="true"
        >
          <div
            class="channel-panel-skeleton-pulse mb-1.5 h-2.5 rounded"
            :style="{ width: section.headerWidth }"
          />
          <div class="flex flex-col gap-0.5">
            <div
              v-for="(rowWidth, rowIndex) in section.rowWidths"
              :key="rowIndex"
              class="flex items-center gap-2 rounded-md px-2 py-1.5"
            >
              <div
                class="channel-panel-skeleton-pulse h-4 w-4 shrink-0 rounded"
              />
              <div
                class="channel-panel-skeleton-pulse h-3 rounded"
                :style="{ width: rowWidth }"
              />
            </div>
          </div>
        </div>
      </div>
      <template v-else>
        <div class="paper-editor-panel-stage">
          <Transition name="paper-editor-panel-fade">
            <PaperEditorPanel
              v-if="
                showPaperEditorPanel && paperPanelBridge.registeredContext.value
              "
              key="editor"
              class="paper-editor-panel-stage__panel"
              :context="paperPanelBridge.registeredContext.value"
            />
            <div
              v-else
              key="channels"
              class="paper-editor-panel-stage__channels min-h-0 flex-1 flex flex-col overflow-hidden"
            >
              <ChannelPanelList
                :effective-categories="effectiveCategories"
                :active-channel-id="activeChannelId"
                :server-owner-id="selectedServer?.ownerId ?? null"
                :voice-lobby-channel-id="voiceLobbyChannelId ?? null"
                :current-voice-channel-id="currentVoiceChannelId ?? null"
                :hovered-channel-id="hoveredChannelId"
                :channel-missed-activity-by-channel-id="
                  channelMissedActivityByChannelId
                "
                :selected-server-id="selectedServer?.id ?? null"
                :can-create-channels="!!canCreateChannels"
                :can-reorder-channels="canReorderChannels"
                :can-reorder-categories="canReorderCategories"
                :can-invite="canInvite"
                :side-chat-collapsed="!!sideChatCollapsed"
                :open-profile-user-id="openProfileUserId ?? null"
                :get-user-by-id="getUserById"
                :voice-participant-label="voiceParticipantLabel"
                :participant-voice-ui="participantVoiceUi"
                :get-vc-activity-presence="getVcActivityPresence"
                :vc-activity-king-user-id="vcActivityKingUserId ?? null"
                :row-can-manage-channel="rowCanManageChannel"
                :can-move-vc-participant="canMoveVcParticipant"
                :bubble-mode="bubbleMode"
                @open-create-channel="(id) => emit('open-create-channel', id)"
                @open-create-category="emit('open-create-category')"
                @open-category-settings="
                  (id) => emit('open-category-settings', id)
                "
                @open-channel-settings="
                  (payload) => emit('open-channel-settings', payload)
                "
                @category-contextmenu="onCategoryRowContextMenu"
                @channel-click="onChannelRowClick"
                @channel-contextmenu="onChannelRowContextMenu"
                @vc-participant-click="handleOpenVcProfile"
                @vc-participant-contextmenu="onVcParticipantContextMenu"
                @vc-participant-move="onVcParticipantDragMove"
                @invite="forwardInvite"
                @toggle-side-chat="emit('toggle-side-chat')"
                @set-hovered-channel="(id) => (hoveredChannelId = id)"
                @quick-create-submit="
                  (payload) => emit('quick-create-submit', payload)
                "
                @channel-reorder="onChannelReorder"
                @category-reorder="onCategoryReorder"
              />
            </div>
          </Transition>
        </div>

        <div
          v-if="paperEditorReady"
          class="paper-editor-panel-dock"
          :class="{ 'paper-editor-panel-dock--open': showPaperEditorPanel }"
        >
          <button
            type="button"
            class="paper-editor-panel-dock__btn"
            :class="{
              'paper-editor-panel-dock__btn--active': showPaperEditorPanel,
            }"
            :title="
              showPaperEditorPanel ? 'Close editor tools' : 'Open editor tools'
            "
            :aria-label="
              showPaperEditorPanel ? 'Close editor tools' : 'Open editor tools'
            "
            :aria-pressed="showPaperEditorPanel"
            @click="togglePaperEditorPanel"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span class="paper-editor-panel-dock__label">{{
              showPaperEditorPanel ? 'Close' : 'Editor'
            }}</span>
          </button>
        </div>

        <GuildVoiceConnectionStrip
          v-if="
            showVoiceConnectionPanel && (currentVoiceChannelId ?? '').trim()
          "
          :categories="categories"
          :users="users"
          :current-user-id="currentUserId"
          :current-voice-channel-id="currentVoiceChannelId ?? null"
          :current-voice-channel-name="currentVoiceChannelName ?? ''"
          :echo-server-id="selectedServer?.id ?? null"
          :focus-guild-voice-channel-in-sidebar="
            focusGuildVoiceChannelInSidebar
          "
          :vc-muted="vcMuted"
          :vc-deafened="vcDeafened"
          :vc-video="vcVideo"
          :vc-screenshare="vcScreenshare"
          :can-use-video="canUseVideo"
          :live-kit-state="liveKitState"
          :live-kit-network-stats="liveKitNetworkStats"
          :live-kit-room="liveKitRoom"
          :voice-session-participants="voiceSessionParticipants"
          :vc-mic-input-level="vcMicInputLevel"
          :on-switch-camera="onSwitchCamera"
          @update:vc-muted="emit('update:vcMuted', $event)"
          @update:vc-deafened="emit('update:vcDeafened', $event)"
          @update:vc-video="emit('update:vcVideo', $event)"
          @update:vc-screenshare="emit('update:vcScreenshare', $event)"
          @leave-voice="emit('leave-voice')"
          @open-voice-audio-settings="emit('open-voice-audio-settings')"
        />
      </template>
    </div>

    <div
      v-if="!collapsed && resizeHandlers"
      class="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-col-resize z-[50]"
      style="background: transparent; border: none"
      aria-label="Resize channel panel"
      @mousedown="resizeHandlers.onResizeStart"
      @dblclick="resizeHandlers.onReset"
    />

    <ChannelPanelContextMenu
      :menu-open="menuOpen"
      :menu-ref="_menuRef"
      :panel-context="panelContext"
      :selected-server-id="selectedServer?.id ?? null"
      :menu-position="menuPosition"
      :dev-mode-ids-enabled="devModeIdsEnabled"
      :row-can-manage-channel="rowCanManageChannel"
      :vc-context-is-self="vcContextIsSelf"
      :vc-context-show-voice-mod="vcContextShowVoiceMod"
      :show-vc-mention-in-chat="showVcMentionInChat"
      :can-create-channels="!!canCreateChannels"
      :on-message-user="onMessageUser"
      :vc-menu-can-mute="vcMenuCanMute"
      :vc-menu-can-deafen="vcMenuCanDeafen"
      :vc-menu-can-disconnect="vcMenuCanDisconnect"
      :vc-menu-can-move="vcMenuCanMove"
      :vc-menu-is-stage="vcMenuIsStage"
      :vc-menu-target-is-speaker="vcMenuTargetIsSpeaker"
      :vc-menu-can-invite-to-speak="vcMenuCanInviteToSpeak"
      :vc-move-targets="vcMoveTargets"
      :vc-menu-server-muted="vcMenuServerMuted"
      :vc-menu-server-deafened="vcMenuServerDeafened"
      :can-moderate-user="!!onModerateUser"
      :vc-context-target-timed-out="vcContextTargetTimedOut"
      :get-remote-participant-volume="getRemoteParticipantVolume"
      :set-remote-participant-volume="setRemoteParticipantVolume"
      :channel-can-mark-read="channelMenuCanMarkRead"
      @channel-menu-open="channelMenuOpenChannel"
      @channel-menu-invite="channelMenuInvite"
      @channel-menu-settings="channelMenuChannelSettings"
      @channel-menu-delete="channelMenuDelete"
      @channel-menu-copy-id="channelMenuCopyId"
      @channel-menu-copy-link="channelMenuCopyLink"
      @channel-menu-mark-read="channelMenuMarkRead"
      @category-menu-create-channel="categoryMenuCreateChannel"
      @category-menu-settings="categoryMenuSettings"
      @category-menu-delete="categoryMenuDelete"
      @category-menu-copy-name="categoryMenuCopyName"
      @category-menu-copy-server-id="categoryMenuCopyServerId"
      @vc-menu-profile="openVcProfileFromMenu"
      @vc-menu-mention="vcMenuMention"
      @vc-menu-message="vcMenuMessage"
      @vc-menu-copy-user-id="vcMenuCopyUserId"
      @vc-menu-move-pick="vcMenuMovePick"
      @vc-moderate="vcModerateFromMenu"
      @vc-moderate-server="vcModerateServerFromMenu"
    />
  </nav>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanel.scss';

.channel-panel-skeleton-pulse {
  background: var(--overlay-subtle);
  animation: channel-panel-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes channel-panel-skeleton-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .channel-panel-skeleton-pulse {
    animation: none;
    opacity: 0.6;
  }
}
</style>
