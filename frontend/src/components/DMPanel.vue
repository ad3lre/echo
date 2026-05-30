<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';
import {
  echoPeerMapFromInject,
  useDmConversationSubtitle,
} from '@/features/dm/composables/useDmConversationSubtitle';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import CallRingtoneInlinePlayer from '@/components/CallRingtoneInlinePlayer.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import { dmInboxEntrySortKey } from '@/features/dm/applyManualDmInboxOrder';
import { useDmInboxManualOrderStore } from '@/stores/dmInboxManualOrder';
import {
  selectPresence,
  type PresenceSelection,
} from '@/services/domain/presence';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { linkTokenChannel, linkTokenUser } from '@/utils/idTokens';
import {
  getPopoutAnchorRect,
  type PopoutAnchorRect,
} from '@/utils/memberProfiles';
import { useDevSettingsStore } from '@/stores/devSettings';
import GuildVoiceActivityStrip from '@/components/GuildVoiceActivityStrip.vue';
import GuildEventActivityStrip from '@/components/GuildEventActivityStrip.vue';
import GuildVoiceConnectionStrip from '@/features/channel-panel/components/GuildVoiceConnectionStrip.vue';
import type {
  GuildVoiceActivityCard,
  GuildEventActivityCard,
} from '@/features/layout/appLayoutLeftChromeProps';
import type { ChannelCategory } from '@/composables/useChannels';
import type { ChannelCategory as GuildVoiceStripCategory } from '@/features/channel-panel/composables/useChannelPanelVoiceState';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import { filterDmMentionNotificationRows } from '@/features/dm/filterDmMentionNotificationRows';
import { useCompactShell } from '@/composables/useCompactShell';
import { echoUserMatchesSearchQuery } from '@/utils/echoUserSearch';

defineOptions({ inheritAttrs: false });

const { isCompactShell } = useCompactShell();

function formatDmUnreadBadgeLabel(count: number): string {
  if (count < 1) return '';
  if (count > 99) return '99+';
  return String(count);
}

function showDmUnreadBadgeOnEntry(entry: DmPanelInboxEntry): boolean {
  const n = entry.unreadDmCount ?? 0;
  if (n < 1) return false;
  if (entry.kind === 'user') {
    return props.selectedUserId !== entry.id;
  }
  return (props.selectedGroupDmChannelId ?? '') !== entry.id;
}

export type DMPanelTab = 'messages' | 'friends' | 'notifications';

const dmListSearch = ref('');
const friendListSearch = ref('');
const requestListSearch = ref('');
/** Instagram-style message requests control (not a primary tab). */
const messageRequestsPopoutOpen = ref(false);

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);
const echoPeerByChannelId = computed(() => echoPeerMapFromInject(layoutLeft));
const { inboxEntrySubtitle, peerUserSubtitle } = useDmConversationSubtitle({
  currentUserId: () => props.currentUserId,
  echoPeerByChannelId,
  resolveAuthorName: (userId) =>
    props.users.find((u) => u.id === userId)?.name ?? 'Someone',
});

function dmInboxEntrySubtitleText(entry: DmPanelInboxEntry): string {
  return inboxEntrySubtitle(entry).text;
}

function dmInboxEntrySubtitleIsTyping(entry: DmPanelInboxEntry): boolean {
  return inboxEntrySubtitle(entry).isTyping;
}

function friendRowSubtitleText(user: { id: string }): string {
  return peerUserSubtitle(user.id).text;
}

function friendRowSubtitleIsTyping(user: { id: string }): boolean {
  return peerUserSubtitle(user.id).isTyping;
}

const props = defineProps<{
  open: boolean;
  /** Controlled from parent; main content switches by this tab. */
  activeTab: DMPanelTab;
  /** Workspace / member roster (Friends tab, message requests resolution). */
  users: {
    id: string;
    name: string;
    username?: string;
    pfp: string;
    status?: string;
    customStatus?: string;
  }[];
  /** Messages tab: merged 1:1 + group rows, recency-sorted. */
  dmInboxEntries: DmPanelInboxEntry[];
  currentUserId: string;
  selectedUserId: string | null;
  /** Group thread id when viewing a group DM — row highlight in Messages list. */
  selectedGroupDmChannelId?: string | null;
  /** Selected pending message request (main view shows request thread). */
  selectedMessageRequestId: string | null;
  friendIds: string[];
  messageRequests: {
    id: string;
    channelId: string;
    fromUserId: string;
    preview: string;
  }[];
  friendRequestsIncoming: { id: string; fromUserId: string }[];
  friendRequestsOutgoing: { id: string; toUserId: string }[];
  /** Active call partner (peer id or group thread id) — shows in-call phone icon on that row. */
  dmCallWithUserId?: string | null;
  dmCallRinging?: boolean;
  dmCallRingRemoteVanishing?: boolean;
  phoneCallIcon?: string;
  /** When true, Friends and Notifications tabs prompt upgrade instead of opening. */
  guestFriendsLocked?: boolean;
  /**
   * Live presence overlay keyed by user id — from presenceByUserId in the layout controller.
   * Used to provide `authoritativeStatus` to `selectPresence` so socket updates are reflected
   * even for peers not yet merged back into `workspace.users`.
   */
  presenceByUserId?: Record<string, string | undefined>;
  /** Same map as layout / chat header — mobile handset glyph on status indicator. */
  presenceMobileByUserId?: Record<string, true>;
  /** Active guild voice channels across joined servers (Messages tab live strip). */
  guildVoiceActivityCards?: GuildVoiceActivityCard[];
  /** Upcoming guild events the user RSVP’d “going” to (Messages tab strip under VC activity). */
  guildEventActivityCards?: GuildEventActivityCard[];
  guildVoiceActivityCurrentVoiceChannelId?: string | null;
  canJoinGuildVoiceForActivity?: (channelId: string) => boolean;
  /** Client-only: favorited rows are sorted to the top in the parent. */
  isDmInboxUserFavorite?: (userId: string) => boolean;
  isDmInboxGroupFavorite?: (channelId: string) => boolean;
  dmMentionNotifications?: DmMentionNotificationRow[];
  dmNotificationReadStateByChannelId?: Readonly<Record<string, string | null>>;
  mentionNotificationCategoriesByServer?: Readonly<
    Record<string, ChannelCategory[]>
  >;
  isPersistedEchoDmThread?: (channelId: string) => boolean;
  /** Called when a participant avatar in the guild VC activity strip is right-clicked. */
  onGuildVcStripParticipantContextMenu?: (payload: {
    userId: string;
    serverId: string;
    channelId: string;
    event: MouseEvent;
  }) => void;
  /** When true, show guild VC mute/deafen/device strip (same as channel list). */
  showGuildVoiceConnectionStrip?: boolean;
  guildVoiceStripCategories?: ReadonlyArray<GuildVoiceStripCategory>;
  guildVoiceChannelId?: string | null;
  guildVoiceChannelName?: string;
  guildVcMuted?: boolean;
  guildVcDeafened?: boolean;
  guildVcVideo?: boolean;
  guildVcScreenshare?: boolean;
  guildVoiceCanUseVideo?: boolean;
  guildVoiceLiveKitState?: 'idle' | 'connecting' | 'connected' | 'error';
  guildVoiceLiveKitNetworkStats?: {
    latencyMs: number;
    jitterMs: number;
    packetLossPct: number;
    bitrateKbps: number;
    codec: string;
    serverRegion?: string;
  } | null;
  guildVoiceLiveKitRoom?: unknown;
  guildVoiceSessionParticipants?: Array<{
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
  guildVoiceMicInputLevel?: number;
  onGuildVoiceSwitchCamera?: (deviceId: string) => void;
  /** Guild VC: jump to server + highlight VC in channel list (compact). */
  focusGuildVoiceChannelInSidebar?: () => void;
}>();

const emit = defineEmits<{
  close: [];
  'request-upgrade': [];
  'update:active-tab': [tab: DMPanelTab];
  'select-dm': [userId: string];
  'select-dm-group': [groupId: string];
  'select-message-request': [requestId: string | null];
  'open-profile': [userId: string, anchorRect: PopoutAnchorRect | null];
  'mark-read': [
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ];
  'hide-from-dm-list': [
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ];
  'toggle-favorite-dm-inbox': [
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ];
  'join-guild-voice-activity': [
    payload: { serverId: string; channelId: string; channelName: string },
  ];
  'open-guild-event-activity': [
    payload: {
      serverId: string;
      channelId: string | null;
      customLocation?: string | null;
      eventId: string;
    },
  ];
  'update:guild-vc-muted': [value: boolean];
  'update:guild-vc-deafened': [value: boolean];
  'update:guild-vc-video': [value: boolean];
  'update:guild-vc-screenshare': [value: boolean];
  'leave-guild-voice': [];
  'open-guild-voice-audio-settings': [];
}>();

type DmPanelContextTarget =
  | {
      type: 'dm-user';
      userId: string;
      name: string;
      anchorRect: PopoutAnchorRect | null;
    }
  | { type: 'dm-group'; channelId: string; name: string }
  | {
      type: 'message-request';
      requestId: string;
      userId: string;
      name: string;
      anchorRect: PopoutAnchorRect | null;
    }
  | {
      type: 'friend';
      userId: string;
      name: string;
      anchorRect: PopoutAnchorRect | null;
    };

const {
  menuOpen,
  menuRef,
  menuPosition,
  openAtEvent,
  closeMenu,
  fitMenuToViewport,
} = useSimpleContextMenu();

const contextTarget = ref<DmPanelContextTarget | null>(null);

watch(menuOpen, async () => {
  await nextTick();
  requestAnimationFrame(() => fitMenuToViewport(menuRef.value));
});

function closeContextMenu() {
  closeMenu();
  contextTarget.value = null;
}

async function openDmEntryContextMenu(entry: DmPanelInboxEntry, e: MouseEvent) {
  const row = e.currentTarget as HTMLElement | null;
  if (entry.kind === 'user') {
    contextTarget.value = {
      type: 'dm-user',
      userId: entry.id,
      name: entry.name,
      anchorRect: getPopoutAnchorRect(row, 'generic'),
    };
  } else {
    contextTarget.value = {
      type: 'dm-group',
      channelId: entry.id,
      name: entry.name,
    };
  }
  await openAtEvent(e);
}

async function openFriendContextMenu(
  user: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    customStatus?: string;
  },
  e: MouseEvent,
) {
  const row = e.currentTarget as HTMLElement | null;
  contextTarget.value = {
    type: 'friend',
    userId: user.id,
    name: user.name,
    anchorRect: getPopoutAnchorRect(row, 'generic'),
  };
  await openAtEvent(e);
}

async function openMessageRequestContextMenu(
  req: { id: string; user: { id: string; name: string } },
  e: MouseEvent,
) {
  const row = e.currentTarget as HTMLElement | null;
  contextTarget.value = {
    type: 'message-request',
    requestId: req.id,
    userId: req.user.id,
    name: req.user.name,
    anchorRect: getPopoutAnchorRect(row, 'generic'),
  };
  await openAtEvent(e);
}

function openContextTarget() {
  const t = contextTarget.value;
  if (!t) return;
  if (t.type === 'dm-group') emit('select-dm-group', t.channelId);
  else if (t.type === 'message-request') selectRequest(t.requestId);
  else emit('select-dm', t.userId);
  closeContextMenu();
}

function openContextProfile() {
  const t = contextTarget.value;
  if (!t) return;
  if (t.type === 'dm-group') return;
  emit('open-profile', t.userId, t.anchorRect);
  closeContextMenu();
}

function copyContextId() {
  const t = contextTarget.value;
  if (!t) return;
  if (t.type === 'dm-group') copyToClipboard(linkTokenChannel(t.channelId));
  else copyToClipboard(linkTokenUser(t.userId));
  closeContextMenu();
}

function markContextAsRead() {
  const t = contextTarget.value;
  if (!t) return;
  if (t.type === 'dm-group') {
    emit('mark-read', { kind: 'group', channelId: t.channelId });
    closeContextMenu();
    return;
  }
  if (t.type === 'dm-user') {
    emit('mark-read', { kind: 'user', userId: t.userId });
    closeContextMenu();
  }
}

function hideContextFromDmList() {
  const t = contextTarget.value;
  if (!t) return;
  if (t.type === 'dm-group') {
    emit('hide-from-dm-list', { kind: 'group', channelId: t.channelId });
    closeContextMenu();
    return;
  }
  if (t.type === 'dm-user') {
    emit('hide-from-dm-list', { kind: 'user', userId: t.userId });
    closeContextMenu();
  }
}

function isDmEntryFavorite(entry: DmPanelInboxEntry): boolean {
  if (entry.kind === 'user') {
    return props.isDmInboxUserFavorite?.(entry.id) ?? false;
  }
  return props.isDmInboxGroupFavorite?.(entry.id) ?? false;
}

function favoriteToggleLabelForDmContext(): string {
  const t = contextTarget.value;
  if (t?.type === 'dm-user') {
    return props.isDmInboxUserFavorite?.(t.userId)
      ? 'Remove from favorites'
      : 'Add to favorites';
  }
  if (t?.type === 'dm-group') {
    return props.isDmInboxGroupFavorite?.(t.channelId)
      ? 'Remove from favorites'
      : 'Add to favorites';
  }
  return 'Add to favorites';
}

function toggleFavoriteContextDm() {
  const t = contextTarget.value;
  if (!t) return;
  if (t.type === 'dm-group') {
    emit('toggle-favorite-dm-inbox', {
      kind: 'group',
      channelId: t.channelId,
    });
    closeContextMenu();
    return;
  }
  if (t.type === 'dm-user') {
    emit('toggle-favorite-dm-inbox', { kind: 'user', userId: t.userId });
    closeContextMenu();
  }
}

// Alias to keep template reads consistent with the rest of the component.
const dmEntries = computed(() => props.dmInboxEntries);

// --- Notifications conversation row (synthetic DM entry) ---
// The Notifications "person" pins to the top of the Messages list; its unread
// badge and subtitle preview derive from the same mention-notification feed the
// full conversation view renders. Filter state now lives in DmNotificationsView.
const notificationUnreadCount = computed(
  () =>
    filterDmMentionNotificationRows({
      rows: props.dmMentionNotifications ?? [],
      preset: 'unread',
      source: { kind: 'all' },
      readStateByChannelId: props.dmNotificationReadStateByChannelId ?? {},
      categoriesByServer: props.mentionNotificationCategoriesByServer ?? {},
      isPersistedEchoDmThread: props.isPersistedEchoDmThread ?? (() => false),
    }).length,
);

/** Subtitle preview for the pinned row — newest mention first (rows are sorted desc). */
const notificationLatestPreview = computed(() => {
  const latest = (props.dmMentionNotifications ?? [])[0];
  if (!latest) return 'No mentions yet';
  const who = latest.authorName?.trim() || 'Someone';
  const body = latest.preview?.trim();
  return body ? `${who}: ${body}` : `${who} mentioned you`;
});

const notificationsRowSelected = computed(
  () => props.activeTab === 'notifications',
);

const dmUsersFiltered = computed(() => {
  const q = dmListSearch.value.trim().toLowerCase();
  if (!q) return dmEntries.value;
  return dmEntries.value.filter((entry) =>
    entry.name.toLowerCase().includes(q),
  );
});

const dmInboxManualOrderStore = useDmInboxManualOrderStore();
const dmDragKey = ref<string | null>(null);
const dmDropLineBefore = ref<number | null>(null);

const dmInboxReorderEnabled = computed(() => false);

function onDmInboxDragStart(entry: DmPanelInboxEntry, e: DragEvent) {
  if (!dmInboxReorderEnabled.value) return;
  const t = e.target;
  if (t instanceof Element && t.closest('button')) {
    e.preventDefault();
    return;
  }
  const k = dmInboxEntrySortKey(entry);
  dmDragKey.value = k;
  const dt = e.dataTransfer;
  if (dt) {
    dt.setData('text/plain', k);
    dt.effectAllowed = 'move';
  }
}

function onDmInboxDragEnd() {
  dmDragKey.value = null;
  dmDropLineBefore.value = null;
}

function onDmInboxListDragOverCapture(e: DragEvent) {
  if (!dmDragKey.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDmRowDragOver(index: number, e: DragEvent) {
  if (!dmDragKey.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  const rect = el.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const n = dmUsersFiltered.value.length;
  const raw = e.clientY < mid ? index : index + 1;
  dmDropLineBefore.value = Math.max(0, Math.min(raw, n));
}

function showDmInboxDropLineBefore(idx: number): boolean {
  return dmDragKey.value !== null && dmDropLineBefore.value === idx;
}

function onDmInboxRowDrop(fallbackLineBefore: number) {
  const dragKey = dmDragKey.value;
  if (!dragKey) return;
  const lineBefore = dmDropLineBefore.value ?? fallbackLineBefore;
  const keys = dmUsersFiltered.value.map(dmInboxEntrySortKey);
  const from = keys.indexOf(dragKey);
  if (from === -1) return;
  const without = keys.filter((k) => k !== dragKey);
  const clamped = Math.max(0, Math.min(lineBefore, without.length));
  without.splice(clamped, 0, dragKey);
  dmInboxManualOrderStore.setOrderFromKeys(without);
  onDmInboxDragEnd();
}

function onDmInboxAppendDragOver(e: DragEvent) {
  if (!dmDragKey.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dmDropLineBefore.value = dmUsersFiltered.value.length;
}

function onDmInboxAppendDrop() {
  onDmInboxRowDrop(dmUsersFiltered.value.length);
}

/** Merged socket + row presence for a 1:1 inbox row (matches chat header / {@link StatusIndicator}). */
function dmInboxUserPresence(entry: DmPanelInboxEntry): PresenceSelection {
  if (entry.kind !== 'user') {
    return selectPresence({ diagnosticsKey: 'dm-inbox:group' });
  }
  return selectPresence({
    authoritativeStatus: props.presenceByUserId?.[entry.id],
    rowStatus: entry.status,
    diagnosticsKey: `dm-inbox:${entry.id}`,
    mobileSurface: !!props.presenceMobileByUserId?.[entry.id],
  });
}

function friendRowPresence(user: {
  id: string;
  status?: string;
}): PresenceSelection {
  return selectPresence({
    authoritativeStatus: props.presenceByUserId?.[user.id],
    rowStatus: user.status,
    diagnosticsKey: `dm-panel-friend:${user.id}`,
    mobileSurface: !!props.presenceMobileByUserId?.[user.id],
  });
}

const friendUsers = computed(() => {
  const set = new Set(props.friendIds);
  return props.users
    .filter((u) => u.id !== props.currentUserId && set.has(u.id))
    .sort((a, b) => {
      return friendRowPresence(a).sortOrder - friendRowPresence(b).sortOrder;
    });
});

const friendUsersFiltered = computed(() => {
  const q = friendListSearch.value.trim().toLowerCase();
  if (!q) return friendUsers.value;
  return friendUsers.value.filter((u) => echoUserMatchesSearchQuery(u, q));
});

const requestsWithUser = computed(() =>
  props.messageRequests
    .map((req) => {
      const user = props.users.find((u) => u.id === req.fromUserId);
      return user ? { ...req, user } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null),
);

const requestsWithUserFiltered = computed(() => {
  const q = requestListSearch.value.trim().toLowerCase();
  if (!q) return requestsWithUser.value;
  return requestsWithUser.value.filter((r) =>
    echoUserMatchesSearchQuery(r.user, q),
  );
});

/** Incoming + outgoing — same as FriendsView “Pending” sub-tab. */
const pendingFriendRequestCount = computed(
  () =>
    props.friendRequestsIncoming.length + props.friendRequestsOutgoing.length,
);

const showSidebarRingtonePlayer = computed(
  () =>
    !!props.dmCallWithUserId &&
    !!props.dmCallRinging &&
    !props.dmCallRingRemoteVanishing,
);

function setActiveTab(tab: DMPanelTab) {
  if (
    props.guestFriendsLocked &&
    (tab === 'friends' || tab === 'notifications')
  ) {
    emit('request-upgrade');
    return;
  }
  emit('update:active-tab', tab);
}

function selectRequest(requestId: string | null) {
  emit('select-message-request', requestId);
}

function toggleMessageRequestsPopout() {
  if (props.guestFriendsLocked) {
    emit('request-upgrade');
    return;
  }
  messageRequestsPopoutOpen.value = !messageRequestsPopoutOpen.value;
}

function selectRequestFromPopout(requestId: string | null) {
  selectRequest(requestId);
  messageRequestsPopoutOpen.value = false;
}

watch(
  () => props.activeTab,
  () => {
    messageRequestsPopoutOpen.value = false;
  },
);
</script>

<template>
  <aside
    v-bind="$attrs"
    class="dm-panel relative h-full min-w-0 overflow-hidden"
    :class="open ? 'pointer-events-auto dm-panel--open' : 'pointer-events-none'"
  >
    <div
      class="dm-panel__inner flex h-full min-w-0 flex-col overflow-hidden"
      :class="open ? 'dm-panel__inner--open' : 'dm-panel__inner--closed'"
      :inert="!open"
    >
      <div class="flex items-center justify-between gap-3 px-4 py-2.5">
        <div class="min-w-0">
          <div
            class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle"
          >
            Messages
          </div>
          <h2 class="mt-0.5 truncate text-base font-bold text-foreground">
            Direct Messages
          </h2>
        </div>
        <button
          v-if="!isCompactShell"
          type="button"
          class="chat-focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-glass-1 px-2.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
          title="Collapse DM panel"
          aria-label="Collapse DM panel"
          @click="emit('close')"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Collapse</span>
        </button>
      </div>

      <!-- Tab bar: switches main content -->
      <div class="flex shrink-0 gap-0.5 px-3 pb-2">
        <button
          type="button"
          class="dm-tab rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            activeTab === 'messages' ? 'dm-tab--active' : 'dm-tab--inactive'
          "
          @click="setActiveTab('messages')"
        >
          Messages
        </button>
        <button
          type="button"
          class="dm-tab relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            activeTab === 'friends' ? 'dm-tab--active' : 'dm-tab--inactive'
          "
          :title="
            guestFriendsLocked
              ? 'Create an account to use Friends'
              : pendingFriendRequestCount > 0
                ? `${pendingFriendRequestCount} pending friend request(s)`
                : undefined
          "
          :aria-label="
            guestFriendsLocked
              ? 'Friends (account required)'
              : pendingFriendRequestCount > 0
                ? `Friends, ${pendingFriendRequestCount} pending friend requests`
                : 'Friends'
          "
          @click="setActiveTab('friends')"
        >
          Friends
          <span
            v-if="guestFriendsLocked"
            class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400"
            title="Upgrade to unlock Friends"
          />
          <span
            v-else-if="pendingFriendRequestCount > 0"
            class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-glass-active px-1 text-[10px] font-bold text-foreground"
            aria-hidden="true"
          >
            {{
              pendingFriendRequestCount > 99 ? '99+' : pendingFriendRequestCount
            }}
          </span>
        </button>
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2.5"
        >
          <!-- Messages tab: search + DM list (also shown while the Notifications
               conversation is open, so the pinned row stays visible). -->
          <div
            v-if="activeTab === 'messages' || activeTab === 'notifications'"
            class="relative flex flex-col gap-2"
          >
            <div class="dm-list-search-wrap relative shrink-0">
              <input
                v-model="dmListSearch"
                type="text"
                placeholder="Search DMs"
                class="dm-list-search w-full rounded-lg border-0 bg-glass-1 py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted outline-none transition-colors"
                aria-label="Search DMs"
              />
              <svg
                class="dm-list-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>

            <!-- Pinned Notifications "person": behaves like a system DM that
                 opens the mentions conversation in the main column. -->
            <button
              type="button"
              class="dm-user-row relative flex w-full shrink-0 items-center gap-3 rounded-xl text-left transition-colors"
              :class="
                notificationsRowSelected
                  ? 'dm-user-row--selected'
                  : 'dm-user-row--idle'
              "
              aria-label="Notifications"
              @click="setActiveTab('notifications')"
            >
              <div class="relative h-10 w-10 shrink-0">
                <div
                  class="dm-notifications-avatar flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
                >
                  <svg
                    class="h-5 w-5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <span
                  v-if="notificationUnreadCount > 0"
                  class="dm-unread-badge pointer-events-none absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-[2.5px] border-[var(--echo-dm-chrome-bg)] bg-[#f23f42] px-[5px] text-[10px] font-bold leading-none text-white shadow-sm"
                  :title="`${notificationUnreadCount} unread`"
                >
                  {{ formatDmUnreadBadgeLabel(notificationUnreadCount) }}
                </span>
              </div>
              <div class="min-w-0 flex-1 truncate">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-medium text-foreground"
                    >Notifications</span
                  >
                </div>
                <div class="truncate text-xs text-fg-soft">
                  {{ notificationLatestPreview }}
                </div>
              </div>
            </button>

            <GuildVoiceActivityStrip
              v-if="(guildVoiceActivityCards?.length ?? 0) > 0"
              :cards="guildVoiceActivityCards ?? []"
              :current-voice-channel-id="
                guildVoiceActivityCurrentVoiceChannelId ?? null
              "
              :can-join-channel="canJoinGuildVoiceForActivity ?? (() => true)"
              @join="emit('join-guild-voice-activity', $event)"
              @participant-contextmenu="
                onGuildVcStripParticipantContextMenu?.($event)
              "
            />

            <GuildEventActivityStrip
              v-if="(guildEventActivityCards?.length ?? 0) > 0"
              :cards="guildEventActivityCards ?? []"
              @open="emit('open-guild-event-activity', $event)"
            />

            <button
              v-if="messageRequests.length > 0"
              type="button"
              class="group flex w-full shrink-0 items-center justify-between rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-glass-hover"
              aria-haspopup="dialog"
              :aria-expanded="messageRequestsPopoutOpen ? 'true' : 'false'"
              @click="toggleMessageRequestsPopout"
            >
              <span
                class="text-[13px] font-semibold text-[#c4b5fd] underline-offset-2 group-hover:underline"
              >
                Message requests
              </span>
              <span
                class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-glass-3 px-1.5 text-[11px] font-bold tabular-nums text-foreground"
              >
                {{
                  messageRequests.length > 99 ? '99+' : messageRequests.length
                }}
              </span>
            </button>

            <div
              v-if="messageRequestsPopoutOpen && messageRequests.length > 0"
              class="absolute inset-0 z-40 flex flex-col bg-scrim-2 px-2 py-3 backdrop-blur-[2px]"
              role="presentation"
              @click.self="messageRequestsPopoutOpen = false"
            >
              <div
                class="custom-scrollbar mt-8 max-h-[min(72vh,440px)] min-h-0 overflow-y-auto rounded-2xl border border-border bg-[var(--echo-dm-inset-bg)] p-3 shadow-2xl"
                role="dialog"
                aria-label="Message requests"
                @click.stop
              >
                <div class="dm-list-search-wrap relative mb-2 shrink-0">
                  <input
                    v-model="requestListSearch"
                    type="text"
                    placeholder="Search requests"
                    class="dm-list-search w-full rounded-lg border-0 bg-glass-1 py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted outline-none transition-colors"
                    aria-label="Search message requests"
                  />
                  <svg
                    class="dm-list-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <div class="space-y-1">
                  <button
                    v-for="req in requestsWithUserFiltered"
                    :key="req.id"
                    type="button"
                    class="dm-user-row flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                    :class="
                      selectedMessageRequestId === req.id
                        ? 'dm-user-row--selected'
                        : 'dm-user-row--idle'
                    "
                    @click="
                      selectRequestFromPopout(
                        selectedMessageRequestId === req.id ? null : req.id,
                      )
                    "
                    @contextmenu.prevent="
                      openMessageRequestContextMenu(req, $event)
                    "
                  >
                    <div
                      class="relative h-10 w-10 shrink-0 overflow-hidden rounded-full"
                    >
                      <PausedGifAvatar
                        :src="safeImageUrl(req.user.pfp)"
                        :alt="req.user.name"
                        :session-key="req.user.id"
                        img-class="rounded-full object-cover"
                      />
                    </div>
                    <div class="min-w-0 flex-1 truncate">
                      <span class="text-sm font-medium text-foreground">{{
                        req.user.name
                      }}</span>
                      <p class="truncate text-xs text-fg-soft">
                        {{ req.preview }}
                      </p>
                    </div>
                  </button>
                </div>
                <p
                  v-if="requestsWithUserFiltered.length === 0"
                  class="px-2 py-6 text-center text-xs text-fg-soft"
                >
                  {{
                    requestListSearch.trim()
                      ? 'No requests match your search.'
                      : 'No pending requests.'
                  }}
                </p>
              </div>
            </div>

            <div
              class="dm-inbox-dnd"
              @dragover.capture="onDmInboxListDragOverCapture"
            >
              <button
                v-for="(entry, dmRowIndex) in dmUsersFiltered"
                :key="entry.id"
                type="button"
                class="dm-user-row relative flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                :class="[
                  (
                    entry.kind === 'group'
                      ? (props.selectedGroupDmChannelId ?? '') === entry.id
                      : props.selectedUserId === entry.id
                  )
                    ? 'dm-user-row--selected'
                    : 'dm-user-row--idle',
                  dmInboxReorderEnabled
                    ? 'cursor-grab select-none active:cursor-grabbing'
                    : '',
                  showDmInboxDropLineBefore(dmRowIndex)
                    ? 'dm-inbox-row--drop-before'
                    : '',
                ]"
                :draggable="dmInboxReorderEnabled"
                @dragstart="onDmInboxDragStart(entry, $event)"
                @dragend="onDmInboxDragEnd"
                @dragover.prevent="onDmRowDragOver(dmRowIndex, $event)"
                @drop.prevent="onDmInboxRowDrop(dmRowIndex)"
                @click="
                  entry.kind === 'group'
                    ? emit('select-dm-group', entry.id)
                    : emit('select-dm', entry.id)
                "
                @contextmenu.prevent="openDmEntryContextMenu(entry, $event)"
              >
                <div class="relative h-10 w-10 shrink-0">
                  <div
                    class="h-10 w-10 overflow-hidden rounded-full ring-2 ring-transparent"
                  >
                    <PausedGifAvatar
                      :src="safeImageUrl(entry.pfp)"
                      :alt="entry.name"
                      :session-key="entry.id"
                      :img-class="
                        entry.kind === 'user' &&
                        dmInboxUserPresence(entry).isOffline
                          ? 'rounded-full object-cover grayscale'
                          : 'rounded-full object-cover'
                      "
                    />
                  </div>
                  <StatusIndicator
                    v-if="
                      entry.kind === 'user' &&
                      dmInboxUserPresence(entry).isLoaded
                    "
                    :status="dmInboxUserPresence(entry).status ?? 'offline'"
                    :mobile-surface="
                      dmInboxUserPresence(entry).indicatorMobileSurface
                    "
                    size="sm"
                    class="pointer-events-none z-[5]"
                  />
                  <span
                    v-if="entry.kind === 'group'"
                    class="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[var(--echo-dm-chrome-bg)] bg-indigo-500 flex items-center justify-center text-[9px] font-bold text-white"
                    title="Group DM"
                  >
                    G
                  </span>
                  <span
                    v-if="showDmUnreadBadgeOnEntry(entry)"
                    class="dm-unread-badge pointer-events-none absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-[2.5px] border-[var(--echo-dm-chrome-bg)] bg-[#f23f42] px-[5px] text-[10px] font-bold leading-none text-white shadow-sm"
                    :title="`${entry.unreadDmCount} unread`"
                  >
                    {{ formatDmUnreadBadgeLabel(entry.unreadDmCount ?? 0) }}
                  </span>
                </div>
                <div class="min-w-0 flex-1 truncate">
                  <div class="flex min-w-0 items-center gap-2">
                    <span
                      class="text-sm font-medium truncate"
                      :class="
                        entry.kind === 'user' &&
                        dmInboxUserPresence(entry).isOffline
                          ? 'text-fg-subtle'
                          : 'text-foreground'
                      "
                      >{{ entry.name }}</span
                    >
                    <svg
                      v-if="isDmEntryFavorite(entry)"
                      class="h-3.5 w-3.5 shrink-0 text-amber-400/95"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      title="Favorite"
                    >
                      <path
                        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                      />
                    </svg>
                    <img
                      v-if="
                        props.dmCallWithUserId &&
                        entry.id === props.dmCallWithUserId &&
                        props.phoneCallIcon
                      "
                      :src="props.phoneCallIcon"
                      alt=""
                      class="h-4 w-4 shrink-0 opacity-85"
                      title="In a call"
                    />
                  </div>
                  <div
                    v-if="dmInboxEntrySubtitleText(entry)"
                    class="truncate text-xs text-fg-soft"
                    :class="{
                      'italic text-[color-mix(in_srgb,var(--accent)_72%,var(--fg-soft))]':
                        dmInboxEntrySubtitleIsTyping(entry),
                    }"
                  >
                    {{ dmInboxEntrySubtitleText(entry) }}
                  </div>
                </div>
              </button>
              <div
                v-if="dmInboxReorderEnabled && dmUsersFiltered.length > 0"
                class="dm-inbox-append-target min-h-[10px] -my-0.5 rounded"
                :class="{
                  'dm-inbox-row--drop-before': showDmInboxDropLineBefore(
                    dmUsersFiltered.length,
                  ),
                }"
                @dragover.prevent="onDmInboxAppendDragOver($event)"
                @drop.prevent="onDmInboxAppendDrop()"
              />
            </div>
            <p
              v-if="dmUsersFiltered.length === 0"
              class="py-4 text-center text-xs text-fg-subtle"
            >
              {{
                dmListSearch.trim()
                  ? 'No conversations match your search.'
                  : 'No direct messages yet.'
              }}
            </p>
          </div>

          <!-- Friends tab: list of friends (main view has full Friends UI) -->
          <div v-else-if="activeTab === 'friends'" class="flex flex-col gap-2">
            <div class="dm-list-search-wrap relative shrink-0">
              <input
                v-model="friendListSearch"
                type="text"
                placeholder="Search Friends"
                class="dm-list-search w-full rounded-lg border-0 bg-glass-1 py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted outline-none transition-colors"
                aria-label="Search Friends"
              />
              <svg
                class="dm-list-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>

            <div class="space-y-1">
              <template v-if="friendUsersFiltered.length > 0">
                <button
                  v-for="user in friendUsersFiltered"
                  :key="user.id"
                  type="button"
                  class="dm-user-row flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                  :class="
                    selectedUserId === user.id
                      ? 'dm-user-row--selected'
                      : 'dm-user-row--idle'
                  "
                  @click="emit('select-dm', user.id)"
                  @contextmenu.prevent="openFriendContextMenu(user, $event)"
                >
                  <div class="relative h-10 w-10 shrink-0">
                    <div
                      class="h-10 w-10 overflow-hidden rounded-full ring-2 ring-transparent"
                    >
                      <PausedGifAvatar
                        :src="safeImageUrl(user.pfp)"
                        :alt="user.name"
                        :session-key="user.id"
                        :img-class="
                          friendRowPresence(user).isOffline
                            ? 'rounded-full object-cover grayscale'
                            : 'rounded-full object-cover'
                        "
                      />
                    </div>
                    <StatusIndicator
                      v-if="friendRowPresence(user).isLoaded"
                      :status="friendRowPresence(user).status ?? 'offline'"
                      :mobile-surface="
                        friendRowPresence(user).indicatorMobileSurface
                      "
                      size="sm"
                      class="pointer-events-none z-[5]"
                    />
                  </div>
                  <div class="min-w-0 flex-1 truncate">
                    <span
                      class="text-sm font-medium"
                      :class="
                        friendRowPresence(user).isOffline
                          ? 'text-fg-subtle'
                          : 'text-foreground'
                      "
                      >{{ user.name }}</span
                    >
                    <div
                      v-if="friendRowSubtitleText(user)"
                      class="truncate text-xs text-fg-soft"
                      :class="{
                        'italic text-[color-mix(in_srgb,var(--accent)_72%,var(--fg-soft))]':
                          friendRowSubtitleIsTyping(user),
                      }"
                    >
                      {{ friendRowSubtitleText(user) }}
                    </div>
                  </div>
                </button>
              </template>
            </div>
            <p class="px-2 py-4 text-center text-xs text-fg-soft">
              {{
                friendListSearch.trim()
                  ? 'No friends match your search.'
                  : 'Here you can see all your friends :)'
              }}
            </p>
          </div>

        </div>

        <GuildVoiceConnectionStrip
          v-if="
            showGuildVoiceConnectionStrip !== false &&
            (guildVoiceChannelId ?? '').trim()
          "
          :categories="guildVoiceStripCategories ?? []"
          :users="users"
          :current-user-id="currentUserId"
          :current-voice-channel-id="guildVoiceChannelId ?? null"
          :current-voice-channel-name="guildVoiceChannelName ?? ''"
          :vc-muted="guildVcMuted"
          :vc-deafened="guildVcDeafened"
          :vc-video="guildVcVideo"
          :vc-screenshare="guildVcScreenshare"
          :can-use-video="guildVoiceCanUseVideo"
          :live-kit-state="guildVoiceLiveKitState"
          :live-kit-network-stats="guildVoiceLiveKitNetworkStats"
          :live-kit-room="guildVoiceLiveKitRoom"
          :voice-session-participants="guildVoiceSessionParticipants"
          :vc-mic-input-level="guildVoiceMicInputLevel"
          :on-switch-camera="onGuildVoiceSwitchCamera"
          :focus-guild-voice-channel-in-sidebar="
            focusGuildVoiceChannelInSidebar
          "
          @update:vc-muted="emit('update:guild-vc-muted', $event)"
          @update:vc-deafened="emit('update:guild-vc-deafened', $event)"
          @update:vc-video="emit('update:guild-vc-video', $event)"
          @update:vc-screenshare="emit('update:guild-vc-screenshare', $event)"
          @leave-voice="emit('leave-guild-voice')"
          @open-voice-audio-settings="emit('open-guild-voice-audio-settings')"
        />
      </div>

      <div
        v-if="showSidebarRingtonePlayer"
        class="dm-panel__ringtone-sticky shrink-0"
      >
        <CallRingtoneInlinePlayer title="Waiting music" embedded />
      </div>
    </div>
  </aside>

  <Teleport to="body">
    <div
      v-if="menuOpen && contextTarget"
      ref="menuRef"
      class="ellipsis-menu fixed z-[140] min-w-[220px] py-1"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
      role="menu"
      aria-label="DM options"
      @contextmenu.prevent
    >
      <div
        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle truncate border-b border-border"
      >
        {{ contextTarget.name }}
      </div>
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="openContextTarget"
      >
        <svg
          class="echo-menu-item-icon h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        {{
          contextTarget.type === 'dm-group'
            ? 'Open group'
            : contextTarget.type === 'message-request'
              ? 'View request'
              : 'Open DM'
        }}
      </button>
      <button
        v-if="
          contextTarget.type === 'dm-group' || contextTarget.type === 'dm-user'
        "
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="markContextAsRead"
      >
        <svg
          class="echo-menu-item-icon h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        Mark as read
      </button>
      <button
        v-if="
          contextTarget.type === 'dm-group' || contextTarget.type === 'dm-user'
        "
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="toggleFavoriteContextDm"
      >
        <svg
          class="echo-menu-item-icon h-4 w-4 shrink-0 text-amber-500/90"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
        {{ favoriteToggleLabelForDmContext() }}
      </button>
      <button
        v-if="
          contextTarget.type === 'dm-group' || contextTarget.type === 'dm-user'
        "
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="hideContextFromDmList"
      >
        <svg
          class="echo-menu-item-icon h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 7H7v10h10V11m4-4h-4m0 0v4m0-4l-6 6"
          />
        </svg>
        Remove from list
      </button>
      <button
        v-if="contextTarget.type !== 'dm-group'"
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="openContextProfile"
      >
        <svg
          class="echo-menu-item-icon h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5.121 17.804A9 9 0 1118.364 4.561a9 9 0 01-13.243 13.243z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17.8 17.8A7.5 7.5 0 0012 15.5a7.5 7.5 0 00-5.8 2.3"
          />
        </svg>
        Profile
      </button>
      <button
        v-if="devModeIdsEnabled"
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="copyContextId"
      >
        <svg
          class="echo-menu-item-icon h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        Copy {{ contextTarget.type === 'dm-group' ? 'channel' : 'user' }} ID
      </button>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* Inner opacity-0 does not hide the aside; without this, closed DM covers channels. */
.dm-panel--open {
  background:
    radial-gradient(circle at top left, var(--vue-auto-022), transparent 26%),
    radial-gradient(
      circle at bottom right,
      var(--vue-auto-027),
      transparent 30%
    ),
    linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

:global([data-theme='light'] .dm-panel--open) {
  /* Light mode: reduce blur and use solid background to avoid wash-out */
  background: linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.dm-panel__inner {
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms ease-out;
}

.dm-panel__inner--open {
  opacity: 1;
  transform: translateX(0);
}

.dm-panel__inner--closed {
  opacity: 0;
  transform: translateX(-18px);
}

.dm-tab {
  border: none;
  color: inherit;
  cursor: pointer;
}

.dm-tab--inactive {
  color: var(--vue-auto-033);
  background: transparent;
}

.dm-tab--inactive:hover {
  color: var(--vue-auto-009);
  background: var(--vue-auto-002);
}

.dm-tab--active {
  color: var(--vue-auto-025);
  background: var(--vue-auto-003);
}

.dm-tab--requests {
  display: inline-flex;
  align-items: center;
}

.dm-notifications-avatar {
  background: linear-gradient(
    140deg,
    color-mix(in srgb, var(--accent) 92%, white 8%) 0%,
    color-mix(in srgb, var(--accent) 62%, black 12%) 100%
  );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 14%, transparent);
}

.dm-user-row {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: var(--echo-density-dm-row-py, 0.625rem)
    var(--echo-density-dm-row-px, 0.75rem);
}

.dm-user-row--idle:hover {
  background: var(--vue-auto-002);
}

.dm-user-row--selected {
  background: var(--vue-auto-003);
}

.dm-inbox-row--drop-before::before {
  content: '';
  position: absolute;
  left: 4px;
  right: 4px;
  top: -3px;
  height: 2px;
  border-radius: 2px;
  background: rgba(139, 92, 246, 0.95);
  pointer-events: none;
  z-index: 2;
}

.dm-requests-pill {
  background-color: var(--vue-auto-127);
  color: inherit;
  backdrop-filter: blur(24px) saturate(1.35);
  -webkit-backdrop-filter: blur(24px) saturate(1.35);
}

.dm-requests-pill:hover {
  background-color: var(--vue-auto-128);
}

/* Same liquid glass as `.chat-liquid-glass-menu` / chat header — no extra border. */
.dm-panel__ringtone-sticky {
  margin: 0 0.75rem 0.75rem;
  padding: 0.5rem 0.625rem 0.625rem;
  border: none;
  border-radius: 14px;
  overflow: hidden;
  background-color: var(
    --chat-glass-header-bg-fallback,
    var(--chat-glass-header-bg)
  );
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .dm-panel__ringtone-sticky {
    background-color: var(--chat-glass-header-bg);
    backdrop-filter: var(--chat-glass-header-backdrop);
    -webkit-backdrop-filter: var(--chat-glass-header-backdrop);
  }
}
</style>
