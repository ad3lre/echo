<script setup lang="ts">
import { computed, inject, ref, unref, watch } from 'vue';
import type { MaybeRef } from 'vue';
import ServerList from '@/components/ServerList.vue';
import ChannelPanel from '@/components/ChannelPanel.vue';
import ChannelPanelContextMenu from '@/features/channel-panel/components/ChannelPanelContextMenu.vue';
import DMPanel from '@/components/DMPanel.vue';
import MoreServersPanel from '@/components/MoreServersPanel.vue';
import { useServerStore } from '@/stores/server';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { useDevSettingsStore } from '@/stores/devSettings';
import { storeToRefs } from 'pinia';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { linkTokenUser } from '@/utils/idTokens';
import {
  LAYOUT_LEFT_CHROME_KEY,
  LAYOUT_SERVER_RAIL_ACTIONS_KEY,
  type LayoutLeftChromeHostHandlers,
} from '@/features/layout/layoutInjectionKeys';
import type { AppLayoutLeftChromeProps } from '@/features/layout/appLayoutLeftChromeProps';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import type { ChannelSummary } from '@shared/types';
import type { DmSubView } from '@/features/layout/mainSurface';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import type { CreateChannelModalSubmitPayload } from '@/components/CreateChannelModal.vue';
import { channelPanelDiag } from '@/utils/channelPanelDiag';
import { getChannelDisplayName } from '@/assets/icons';

type DmMarkReadPayload =
  | { kind: 'user'; userId: string }
  | { kind: 'group'; channelId: string };

const serverStore = useServerStore();

const props = defineProps<
  Partial<AppLayoutLeftChromeProps> & {
    /** `contents`: participate in parent grid. `stack`: one flex row for compact shell. */
    chromeWrap?: 'contents' | 'stack';
    /** Desktop grid: server/action rail in a top strip (from Appearance settings). */
    actionRailTopLayout?: boolean;
  }
>();

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);

const stackChrome = computed(
  () => (props.chromeWrap ?? 'contents') === 'stack',
);

function g(key: keyof AppLayoutLeftChromeProps): any {
  const inj = layoutLeft;
  if (inj && (inj as Record<string, unknown>)[key as string] !== undefined) {
    return unref((inj as Record<string, MaybeRef<unknown>>)[key as string]);
  }
  return (props as Record<string, unknown>)[key as string];
}

const noopProfile = (_userId: string, _anchor: PopoutAnchorRect | null) => {};

const lc = computed((): AppLayoutLeftChromeProps => {
  return {
    compactTriPaneGuildNav: g('compactTriPaneGuildNav') ?? false,
    hideServerRail: g('hideServerRail'),
    isAuthenticated: g('isAuthenticated') ?? false,
    guestFriendsLocked: g('guestFriendsLocked'),
    activeRailTab: g('activeRailTab') ?? 'servers',
    channelPanelCollapsed: g('channelPanelCollapsed') ?? false,
    memberPanelCollapsed: g('memberPanelCollapsed') ?? false,
    memberPanelCollapsedRaw:
      g('memberPanelCollapsedRaw') ?? g('memberPanelCollapsed') ?? false,
    isDmUiContext: g('isDmUiContext') ?? false,
    isServerEmptyOnboarding: g('isServerEmptyOnboarding') ?? false,
    isExploreView: g('isExploreView') ?? false,
    inDmMode: g('inDmMode') ?? false,
    dmPanelOpen: g('dmPanelOpen') ?? false,
    channelPanelLoading: g('channelPanelLoading'),
    currentUserForServerList: g('currentUserForServerList') ?? null,
    presenceByUserId: g('presenceByUserId') ?? {},
    presenceMobileByUserId: g('presenceMobileByUserId') ?? {},
    serverNotificationLevelsMap: g('serverNotificationLevelsMap') ?? {},
    serverPingKindsMap: g('serverPingKindsMap') ?? {},
    serverPingBubblesMap: g('serverPingBubblesMap') ?? {},
    serverPingChannelDotsMap: g('serverPingChannelDotsMap') ?? {},
    serverUnreadActivityDotMap: g('serverUnreadActivityDotMap') ?? {},
    channelMissedActivityByChannelId:
      g('channelMissedActivityByChannelId') ?? {},
    serverActiveVoiceByServerId: g('serverActiveVoiceByServerId') ?? {},
    guildVoiceActivityCards: g('guildVoiceActivityCards') ?? [],
    guildEventActivityCards: g('guildEventActivityCards') ?? [],
    guildVoiceActivityCurrentVoiceChannelId:
      g('guildVoiceActivityCurrentVoiceChannelId') ?? null,
    canOpenServerSettingsForServer:
      g('canOpenServerSettingsForServer') ?? (() => false),
    canOpenInviteForServer: g('canOpenInviteForServer') ?? (() => false),
    reorderVisibleServers: g('reorderVisibleServers') ?? (() => {}),
    isMoreServersPanelOpen: g('isMoreServersPanelOpen') ?? false,
    isMoreServersCompact: g('isMoreServersCompact') ?? false,
    isMoreServersPinned: g('isMoreServersPinned') ?? false,
    dmActiveTab: g('dmActiveTab') ?? 'messages',
    dmIncomingRailCluster: g('dmIncomingRailCluster') ?? {
      avatars: [],
      overflowCount: 0,
      totalUnreadCount: 0,
    },
    dmInboxEntries: g('dmInboxEntries') ?? [],
    isDmInboxUserFavorite: g('isDmInboxUserFavorite') ?? (() => false),
    isDmInboxGroupFavorite: g('isDmInboxGroupFavorite') ?? (() => false),
    usersForChannelPanel: g('usersForChannelPanel') ?? [],
    currentUserId: g('currentUserId') ?? '',
    selectedDmUserId: g('selectedDmUserId') ?? null,
    selectedMessageRequestId: g('selectedMessageRequestId') ?? null,
    friendIds: g('friendIds') ?? [],
    messageRequests: g('messageRequests') ?? [],
    friendRequestsIncoming: g('friendRequestsIncoming') ?? [],
    friendRequestsOutgoing: g('friendRequestsOutgoing') ?? [],
    dmMentionNotifications: g('dmMentionNotifications') ?? [],
    dmNotificationReadStateByChannelId:
      g('dmNotificationReadStateByChannelId') ?? {},
    mentionNotificationCategoriesByServer:
      g('mentionNotificationCategoriesByServer') ?? {},
    mentionNotificationServers: g('mentionNotificationServers') ?? [],
    isPersistedEchoDmThread: g('isPersistedEchoDmThread') ?? (() => false),
    dmNotificationsReadPreset: g('dmNotificationsReadPreset') ?? 'all',
    dmNotificationsSourceKey: g('dmNotificationsSourceKey') ?? 'all',
    selectedGroupDmChannelId: g('selectedGroupDmChannelId'),
    dmCallWithUserId: g('dmCallWithUserId'),
    dmCallRinging: g('dmCallRinging'),
    dmCallRingRemoteVanishing: g('dmCallRingRemoteVanishing'),
    phoneCallIcon: g('phoneCallIcon'),
    selectedServer: g('selectedServer') ?? null,
    categoriesForServer: g('categoriesForServer') ?? [],
    activeChannelId: g('activeChannelId') ?? '',
    currentUser: g('currentUser'),
    guildVoiceChannelId: g('guildVoiceChannelId') ?? null,
    guildVoiceChannelName: g('guildVoiceChannelName') ?? '',
    liveKitState: g('liveKitState'),
    liveKitNetworkStats: g('liveKitNetworkStats'),
    liveKitRoom: g('liveKitRoom'),
    getRemoteParticipantVolume: g('getRemoteParticipantVolume'),
    setRemoteParticipantVolume: g('setRemoteParticipantVolume'),
    vcMicInputLevel: g('vcMicInputLevel'),
    openMemberProfile: g('openMemberProfile') ?? noopProfile,
    activeMemberProfileId: g('activeMemberProfileId') ?? null,
    guildVcMuted: g('guildVcMuted') ?? false,
    guildVcDeafened: g('guildVcDeafened') ?? false,
    guildVcVideo: g('guildVcVideo') ?? false,
    guildVcScreenshare: g('guildVcScreenshare') ?? false,
    canUseVideo: g('canUseVideo') ?? false,
    canJoinPreviewVoiceChannel:
      g('canJoinPreviewVoiceChannel') ?? (() => false),
    voiceSideChatCollapsed: g('voiceSideChatCollapsed') ?? false,
    canCreateChannels: g('canCreateChannels') ?? false,
    handleChannelReorder: g('handleChannelReorder'),
    handleCategoryReorder: g('handleCategoryReorder'),
    canManageThisChannel: g('canManageThisChannel') ?? (() => false),
    startChannelResize: g('startChannelResize') ?? (() => {}),
    resetChannelWidth: g('resetChannelWidth') ?? (() => {}),
    showServerSettingsMenuItem: g('showServerSettingsMenuItem') ?? false,
    canInviteToCurrentServer: g('canInviteToCurrentServer') ?? false,
    canModerateMemberInServer: g('canModerateMemberInServer') ?? (() => false),
    canVcModerateMember:
      g('canVcModerateMember') ??
      ((
        _userId: string,
        _action:
          | 'serverMute'
          | 'serverDeafen'
          | 'disconnect'
          | 'inviteToSpeak'
          | 'moveToAudience',
      ) => false),
    handleModerateUser: g('handleModerateUser') ?? (() => {}),
    handleVcModerate: g('handleVcModerate') ?? (() => {}),
    selectDmUser: g('selectDmUser') ?? (() => {}),
    onSwitchCamera: g('onSwitchCamera'),
    bugHunterEnabled: g('bugHunterEnabled'),
    voiceSessionParticipants: g('voiceSessionParticipants'),
    getVcActivityPresence: g('getVcActivityPresence'),
    vcActivityKingUserId: g('vcActivityKingUserId') ?? '',
    mobileVoiceChannelTapOpensLobby:
      g('mobileVoiceChannelTapOpensLobby') ?? false,
    voiceLobbyChannelId: g('voiceLobbyChannelId') ?? null,
    hideChannelPanelVoiceChrome: g('hideChannelPanelVoiceChrome'),
    railProfileAwaySelfSpeaking: g('railProfileAwaySelfSpeaking') ?? false,
    focusGuildVoiceChannelInSidebar: g('focusGuildVoiceChannelInSidebar'),
  };
});

/** Shared props for both vertical sidebar rail and horizontal top rail `ServerList`. */
const serverListBindings = computed(() => {
  const L = lc.value;
  return {
    authenticated: L.isAuthenticated,
    activeRailTab: L.activeRailTab,
    showChannelButton:
      L.channelPanelCollapsed &&
      !L.compactTriPaneGuildNav &&
      !L.isDmUiContext &&
      !L.isServerEmptyOnboarding &&
      !L.isExploreView,
    showMemberButton:
      L.memberPanelCollapsedRaw &&
      !L.compactTriPaneGuildNav &&
      !L.isDmUiContext &&
      !L.isServerEmptyOnboarding &&
      !L.isExploreView,
    showDmListButton:
      (L.activeRailTab === 'dm' || L.inDmMode) &&
      !L.dmPanelOpen &&
      !L.isExploreView &&
      !L.isServerEmptyOnboarding,
    currentUser: L.currentUserForServerList,
    presenceMobileByUserId: L.presenceMobileByUserId,
    dmIncomingRailCluster: L.dmIncomingRailCluster,
    serverNotificationLevels: L.serverNotificationLevelsMap,
    serverPingKinds: L.serverPingKindsMap,
    serverPingBubbles: L.serverPingBubblesMap,
    serverPingChannelDots: L.serverPingChannelDotsMap,
    serverUnreadActivityDot: L.serverUnreadActivityDotMap,
    serverActiveVoiceByServerId: L.serverActiveVoiceByServerId,
    canOpenServerSettingsForServer: L.canOpenServerSettingsForServer,
    canOpenInviteForServer: L.canOpenInviteForServer,
    reorderVisibleServers: L.reorderVisibleServers,
    bugHunterEnabled: L.bugHunterEnabled,
    railProfileAwaySelfSpeaking: L.railProfileAwaySelfSpeaking,
  };
});

/**
 * Compact stack: omit the channel/DM column when it would be empty (e.g. Explore).
 * Otherwise the flex column grows with `w-full` on the root and steals all width from main content.
 *
 * Explore has no ChannelPanel — only the server/action rail matters; `dmPanelOpen` must not widen
 * this column (would render an empty strip beside the rail on phone swipe).
 */
const showStackChannelColumn = computed(() => {
  const L = lc.value;
  const channelVisible =
    !L.isExploreView && !L.isDmUiContext && !L.isServerEmptyOnboarding;
  if (L.isExploreView) {
    return !!L.isMoreServersPanelOpen;
  }
  if (L.compactTriPaneGuildNav && channelVisible) {
    // Guild tri-pane: keep the channel column mounted even when the pager shows chat/members.
    // Toggling it with `compactPagerPane` caused layout churn during the horizontal snap that
    // read as a short “twitch” on the chat surface.
    return true;
  }
  return channelVisible || L.dmPanelOpen || L.isMoreServersPanelOpen;
});

/** When false, the stack row would be empty (e.g. welcome-back gate hides the rail and Explore hides the channel column). An empty row still used `w-full bg-bg` and covered the main pane. */
const stackChromeRowHasVisibleChildren = computed(() => {
  const L = lc.value;
  return !L.hideServerRail || showStackChannelColumn.value;
});

/**
 * Without this, explore rail-only swipe uses `shrink-0` and the row is ~96px wide inside a
 * full-width pager cell — the rest reads as empty space beside the action rail.
 */
const stackChromeRootRowClass = computed(() => {
  const L = lc.value;
  const base = 'flex h-full min-h-0 min-w-0 flex-row';
  if (L.compactTriPaneGuildNav) return [base, 'w-full'];
  if (L.isDmUiContext) return [base, 'w-full'];
  if (L.isExploreView && !showStackChannelColumn.value) {
    return [base, 'w-full', 'bg-bg'];
  }
  return [base, 'shrink-0'];
});

function categoryChannelCount(
  cats: AppLayoutLeftChromeProps['categoriesForServer'] | undefined,
): number {
  if (!Array.isArray(cats)) return 0;
  let n = 0;
  for (const c of cats) {
    n += c.channels?.length ?? 0;
  }
  return n;
}

watch(
  () => {
    const L = lc.value;
    const channelPanelShown =
      !L.isExploreView && !L.isDmUiContext && !L.isServerEmptyOnboarding;
    return {
      stackChrome: stackChrome.value,
      compactTriPaneGuildNav: L.compactTriPaneGuildNav,
      channelPanelVIf: channelPanelShown,
      hideReason: L.isExploreView
        ? 'explore'
        : L.isDmUiContext
          ? 'dm'
          : L.isServerEmptyOnboarding
            ? 'server_empty_onboarding'
            : null,
      categoriesLen: L.categoriesForServer?.length ?? 0,
      channelRows: categoryChannelCount(L.categoriesForServer),
      channelPanelLoading: L.channelPanelLoading ?? false,
      selectedServerId: L.selectedServer?.id ?? null,
      activeChannelId: L.activeChannelId,
      usersForChannelPanelLen: L.usersForChannelPanel?.length ?? 0,
    };
  },
  (v) => {
    channelPanelDiag('LeftChrome:lc', v as Record<string, unknown>);
  },
  { flush: 'post' },
);

function host(): Partial<LayoutLeftChromeHostHandlers> | null {
  return layoutLeft;
}

/* ===== Guild VC strip participant context menu ===== */

const { devModeIdsEnabled } = storeToRefs(useDevSettingsStore());

const {
  menuOpen: vcStripMenuOpen,
  menuRef: vcStripMenuRef,
  menuPosition: vcStripMenuPosition,
  openAtEvent: vcStripOpenAtEvent,
  closeMenu: vcStripCloseMenu,
} = useSimpleContextMenu();

type VcStripContext = {
  userId: string;
  serverId: string;
  channelId: string;
};

const vcStripContext = ref<VcStripContext | null>(null);
const vcStripMovePickerExpanded = ref(false);

watch(vcStripMenuOpen, (open) => {
  if (!open) {
    vcStripContext.value = null;
    vcStripMovePickerExpanded.value = false;
  }
});

async function onGuildVcStripParticipantContextMenu(payload: {
  userId: string;
  serverId: string;
  channelId: string;
  event: MouseEvent;
}) {
  if (!payload.userId) return;
  vcStripContext.value = {
    userId: payload.userId,
    serverId: payload.serverId,
    channelId: payload.channelId,
  };
  await vcStripOpenAtEvent(payload.event);
}

const vcStripIsSelf = computed(() => {
  const ctx = vcStripContext.value;
  return !!(ctx && ctx.userId && ctx.userId === lc.value.currentUserId);
});

const vcStripParticipantState = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx) return null;
  return (
    lc.value.voiceSessionParticipants?.find((p) => p.id === ctx.userId) ?? null
  );
});

const vcStripCanMute = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx || vcStripIsSelf.value) return false;
  return lc.value.canVcModerateMember?.(ctx.userId, 'serverMute') ?? false;
});

const vcStripCanDeafen = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx || vcStripIsSelf.value) return false;
  return lc.value.canVcModerateMember?.(ctx.userId, 'serverDeafen') ?? false;
});

const vcStripCanDisconnect = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx || vcStripIsSelf.value) return false;
  return lc.value.canVcModerateMember?.(ctx.userId, 'disconnect') ?? false;
});

const vcStripVcMenuCanMove = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx || vcStripIsSelf.value) return false;
  return lc.value.canVcModerateMember?.(ctx.userId, 'move') ?? false;
});

const vcStripMoveTargets = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx) return [];
  const src = ctx.channelId;
  const out: { id: string; name: string; disabled: boolean }[] = [];
  const cats = lc.value.categoriesForServer ?? [];
  const canJoin = lc.value.canJoinPreviewVoiceChannel;
  for (const cat of cats) {
    for (const ch of cat.channels) {
      if (ch.parentChannelId) continue;
      if ((ch.type !== 'voice' && ch.type !== 'stage') || ch.id === src)
        continue;
      const name = getChannelDisplayName(ch.name);
      const dis = !!(canJoin && !canJoin(ch.id));
      out.push({ id: ch.id, name, disabled: dis });
    }
  }
  return out;
});

const vcStripShowVoiceMod = computed(
  () =>
    !vcStripIsSelf.value &&
    (vcStripCanMute.value ||
      vcStripCanDeafen.value ||
      vcStripCanDisconnect.value),
);

const vcStripPanelContext = computed(() => {
  const ctx = vcStripContext.value;
  if (!ctx) return null;
  return { type: 'vc' as const, userId: ctx.userId };
});

function vcStripMenuProfile() {
  const ctx = vcStripContext.value;
  if (!ctx) return;
  vcStripCloseMenu();
  lc.value.openMemberProfile(ctx.userId, null);
}

function vcStripMenuCopyUserId() {
  const ctx = vcStripContext.value;
  if (!ctx) return;
  copyToClipboard(linkTokenUser(ctx.userId));
  vcStripCloseMenu();
}

function vcStripModerate(
  action:
    | 'serverMute'
    | 'serverDeafen'
    | 'disconnect'
    | 'inviteToSpeak'
    | 'moveToAudience',
) {
  const ctx = vcStripContext.value;
  if (!ctx) return;
  vcStripCloseMenu();
  lc.value.handleVcModerate({
    action,
    targetUserId: ctx.userId,
    contextVoiceChannelId: ctx.channelId,
  });
}

function vcStripMoveToggle() {
  vcStripMovePickerExpanded.value = !vcStripMovePickerExpanded.value;
}

function vcStripMovePick(destChannelId: string) {
  const ctx = vcStripContext.value;
  if (!ctx) return;
  vcStripCloseMenu();
  vcStripMovePickerExpanded.value = false;
  lc.value.handleVcModerate({
    action: 'move',
    targetUserId: ctx.userId,
    targetChannelId: destChannelId,
    contextVoiceChannelId: ctx.channelId,
  });
}

function vcStripModerateServer(action: 'kick' | 'ban' | 'timeout') {
  const ctx = vcStripContext.value;
  if (!ctx) return;
  vcStripCloseMenu();
  lc.value.handleModerateUser({
    action,
    targetUserId: ctx.userId,
    ...(action === 'timeout' ? { timeoutMinutes: 60 } : {}),
  });
}

/* ===== end guild VC strip context menu ===== */

const emit = defineEmits<{
  'select-servers': [];
  'select-server': [serverId: string];
  'toggle-explore': [];
  'toggle-dm-panel': [];
  'select-incoming-dm': [userId: string];
  'select-incoming-group-dm': [channelId: string];
  'open-dm-inbox-overflow': [];
  'toggle-more-servers': [];
  'expand-channels': [];
  'expand-members': [];
  'open-self-profile': [anchor: PopoutAnchorRect | null];
  'open-bug-report': [];
  'open-settings': [];
  'open-auth': [];
  'server-rail-settings': [serverId: string];
  'server-rail-invite': [serverId: string];
  'server-rail-notification-settings': [serverId: string];
  'server-rail-mark-read': [serverId: string];
  'server-rail-mark-all-read': [];
  'dm-rail-mark-all-read': [];
  'server-rail-leave': [serverId: string];
  'more-servers-close': [];
  'more-servers-set-compact': [compact: boolean];
  'more-servers-toggle-pinned': [];
  'more-servers-open-server': [serverId: string];
  'dm-close': [];
  'dm-update-active-tab': [tab: DmSubView];
  'dm-select-dm': [userId: string];
  'dm-select-group': [groupId: string];
  'dm-select-message-request': [requestId: string | null];
  'dm-ignore-request': [requestId: string];
  'dm-accept-friend-request': [userId: string];
  'dm-decline-friend-request': [userId: string];
  'dm-cancel-friend-request': [userId: string];
  'dm-send-friend-request': [userId: string];
  'dm-mark-read': [payload: DmMarkReadPayload];
  'dm-hide-from-inbox': [
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ];
  'dm-toggle-favorite-inbox': [
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ];
  'dm-join-guild-voice-activity': [
    payload: { serverId: string; channelId: string; channelName: string },
  ];
  'dm-request-upgrade': [];
  'dm-update-notifications-read-preset': [preset: NotificationReadPreset];
  'dm-update-notifications-source-key': [key: string];
  'dm-panel-resize-start': [e: MouseEvent];
  'dm-panel-resize-reset': [];
  'channel-update-active-id': [id: string];
  'channel-update-collapsed': [v: boolean];
  'channel-update-vc-muted': [v: boolean];
  'channel-update-vc-deafened': [v: boolean];
  'channel-update-vc-video': [v: boolean];
  'channel-update-vc-screenshare': [v: boolean];
  'channel-join-voice': [payload: { channelId: string; channelName: string }];
  'channel-leave-voice': [];
  'channel-invite': [
    payload?: { voiceChannelId: string; voiceChannelName?: string },
  ];
  'channel-open-server-settings': [];
  'channel-toggle-side-chat': [];
  'channel-open-create-channel': [categoryId: string | null];
  'channel-open-create-category': [];
  'channel-quick-create-submit': [payload: CreateChannelModalSubmitPayload];
  'channel-open-channel-settings': [
    payload: { channel: ChannelSummary; categoryId: string },
  ];
  'channel-open-category-settings': [categoryId: string];
  'channel-delete-channel': [payload: { channelId: string }];
  'channel-delete-category': [payload: { categoryId: string }];
  'channel-open-notification-settings': [];
  'channel-open-voice-audio-settings': [];
  'channel-leave-server': [serverId: string];
  'channel-mark-read': [channelId: string];
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
}>();

function fireSelectServers() {
  const h = host();
  if (h?.onSelectServers) h.onSelectServers();
  else emit('select-servers');
}
function fireSelectServer(serverId: string) {
  const h = host();
  if (h?.onSelectServer) h.onSelectServer(serverId);
  else emit('select-server', serverId);
}
function fireToggleExplore() {
  const h = host();
  if (h?.onToggleExplore) h.onToggleExplore();
  else emit('toggle-explore');
}
function fireToggleDmPanel() {
  const h = host();
  if (h?.onToggleDmPanel) h.onToggleDmPanel();
  else emit('toggle-dm-panel');
}
function fireSelectIncomingDm(userId: string) {
  const h = host();
  if (h?.onSelectIncomingDm) h.onSelectIncomingDm(userId);
  else emit('select-incoming-dm', userId);
}
function fireSelectIncomingGroupDm(channelId: string) {
  const h = host();
  if (h?.onSelectIncomingGroupDm) h.onSelectIncomingGroupDm(channelId);
  else emit('select-incoming-group-dm', channelId);
}
function fireOpenDmInboxOverflow() {
  const h = host();
  if (h?.onOpenDmInboxOverflow) h.onOpenDmInboxOverflow();
  else emit('open-dm-inbox-overflow');
}
function fireToggleMoreServers() {
  const h = host();
  if (h?.onToggleMoreServers) h.onToggleMoreServers();
  else emit('toggle-more-servers');
}
function fireExpandChannels() {
  const h = host();
  if (h?.onExpandChannels) h.onExpandChannels();
  else emit('expand-channels');
}
function fireToggleChannelPanelBubbleMode() {
  const h = host();
  if (h?.onToggleChannelPanelBubbleMode) h.onToggleChannelPanelBubbleMode();
}
function fireExpandMembers() {
  const h = host();
  if (h?.onExpandMembers) h.onExpandMembers();
  else emit('expand-members');
}
function fireOpenSelfProfile(anchor: PopoutAnchorRect | null) {
  const h = host();
  if (h?.onOpenSelfProfile) h.onOpenSelfProfile(anchor);
  else emit('open-self-profile', anchor);
}
function fireOpenBugReport() {
  const h = host();
  if (h?.onOpenBugReport) h.onOpenBugReport();
  else emit('open-bug-report');
}
function fireOpenSettings() {
  const h = host();
  if (h?.onOpenSettings) h.onOpenSettings();
  else emit('open-settings');
}
function fireOpenAuth() {
  const h = host();
  if (h?.onOpenAuth) h.onOpenAuth();
  else emit('open-auth');
}
function fireMoreServersClose() {
  const h = host();
  if (h?.onMoreServersClose) h.onMoreServersClose();
  else emit('more-servers-close');
}
function fireMoreServersSetCompact(compact: boolean) {
  const h = host();
  if (h?.onMoreServersSetCompact) h.onMoreServersSetCompact(compact);
  else emit('more-servers-set-compact', compact);
}
function fireMoreServersTogglePinned() {
  const h = host();
  if (h?.onMoreServersTogglePinned) h.onMoreServersTogglePinned();
  else emit('more-servers-toggle-pinned');
}
function fireDmClose() {
  const h = host();
  if (h?.onDmClose) h.onDmClose();
  else emit('dm-close');
}
function fireDmUpdateActiveTab(tab: DmSubView) {
  const h = host();
  if (h?.onDmUpdateActiveTab) h.onDmUpdateActiveTab(tab);
  else emit('dm-update-active-tab', tab);
}
function fireDmSelectDm(userId: string) {
  const h = host();
  if (h?.onDmSelectDm) h.onDmSelectDm(userId);
  else emit('dm-select-dm', userId);
}
function fireDmSelectGroup(groupId: string) {
  const h = host();
  if (h?.onDmSelectGroup) h.onDmSelectGroup(groupId);
  else emit('dm-select-group', groupId);
}
function fireDmSelectMessageRequest(requestId: string | null) {
  const h = host();
  if (h?.onDmSelectMessageRequest) h.onDmSelectMessageRequest(requestId);
  else emit('dm-select-message-request', requestId);
}
function fireDmMarkRead(payload: DmMarkReadPayload) {
  const h = host();
  if (h?.onDmMarkRead) h.onDmMarkRead(payload);
  else emit('dm-mark-read', payload);
}
function fireDmHideFromInbox(
  payload:
    | { kind: 'user'; userId: string }
    | { kind: 'group'; channelId: string },
) {
  const h = host();
  if (h?.onDmHideFromInbox) h.onDmHideFromInbox(payload);
  else emit('dm-hide-from-inbox', payload);
}
function fireDmToggleFavoriteInbox(
  payload:
    | { kind: 'user'; userId: string }
    | { kind: 'group'; channelId: string },
) {
  const h = host();
  if (h?.onDmToggleFavoriteInbox) h.onDmToggleFavoriteInbox(payload);
  else emit('dm-toggle-favorite-inbox', payload);
}
function fireDmJoinGuildVoiceActivity(payload: {
  serverId: string;
  channelId: string;
  channelName: string;
}) {
  const h = host();
  if (h?.onDmPanelJoinGuildVoiceActivity)
    h.onDmPanelJoinGuildVoiceActivity(payload);
  else emit('dm-join-guild-voice-activity', payload);
}
function fireDmRequestUpgrade() {
  const h = host();
  if (h?.onDmRequestUpgrade) h.onDmRequestUpgrade();
  else emit('dm-request-upgrade');
}
function fireDmUpdateNotificationsReadPreset(preset: NotificationReadPreset) {
  const h = host();
  if (h?.onDmUpdateNotificationsReadPreset)
    h.onDmUpdateNotificationsReadPreset(preset);
  else emit('dm-update-notifications-read-preset', preset);
}
function fireDmUpdateNotificationsSourceKey(key: string) {
  const h = host();
  if (h?.onDmUpdateNotificationsSourceKey)
    h.onDmUpdateNotificationsSourceKey(key);
  else emit('dm-update-notifications-source-key', key);
}
function fireDmPanelResizeStart(e: MouseEvent) {
  const h = host();
  if (h?.onDmPanelResizeStart) h.onDmPanelResizeStart(e);
  else emit('dm-panel-resize-start', e);
}
function fireDmPanelResizeReset() {
  const h = host();
  if (h?.onDmPanelResizeReset) h.onDmPanelResizeReset();
  else emit('dm-panel-resize-reset');
}
function fireChannelUpdateActiveId(id: string) {
  const h = host();
  if (h?.onChannelUpdateActiveId) h.onChannelUpdateActiveId(id);
  else emit('channel-update-active-id', id);
}
function fireChannelUpdateCollapsed(v: boolean) {
  const h = host();
  if (h?.onChannelUpdateCollapsed) h.onChannelUpdateCollapsed(v);
  else emit('channel-update-collapsed', v);
}
function fireChannelUpdateVcMuted(v: boolean) {
  const h = host();
  if (h?.onChannelUpdateVcMuted) h.onChannelUpdateVcMuted(v);
  else emit('channel-update-vc-muted', v);
}
function fireChannelUpdateVcDeafened(v: boolean) {
  const h = host();
  if (h?.onChannelUpdateVcDeafened) h.onChannelUpdateVcDeafened(v);
  else emit('channel-update-vc-deafened', v);
}
function fireChannelUpdateVcVideo(v: boolean) {
  const h = host();
  if (h?.onChannelUpdateVcVideo) h.onChannelUpdateVcVideo(v);
  else emit('channel-update-vc-video', v);
}
function fireChannelUpdateVcScreenshare(v: boolean) {
  const h = host();
  if (h?.onChannelUpdateVcScreenshare) h.onChannelUpdateVcScreenshare(v);
  else emit('channel-update-vc-screenshare', v);
}
function fireChannelJoinVoice(payload: {
  channelId: string;
  channelName: string;
}) {
  const h = host();
  if (h?.onChannelJoinVoice) h.onChannelJoinVoice(payload);
  else emit('channel-join-voice', payload);
}
function fireChannelOpenVoiceLobby(payload: {
  channelId: string;
  channelName: string;
}) {
  const h = host();
  if (h?.onChannelOpenVoiceLobby) h.onChannelOpenVoiceLobby(payload);
}
function fireChannelLeaveVoice() {
  const h = host();
  if (h?.onChannelLeaveVoice) h.onChannelLeaveVoice();
  else emit('channel-leave-voice');
}
function fireChannelInvite(payload?: {
  voiceChannelId: string;
  voiceChannelName?: string;
}) {
  const h = host();
  if (h?.onChannelInvite) h.onChannelInvite(payload);
  else emit('channel-invite', payload);
}
function fireChannelOpenServerSettings() {
  const h = host();
  if (h?.onChannelOpenServerSettings) h.onChannelOpenServerSettings();
  else emit('channel-open-server-settings');
}
function fireChannelToggleSideChat() {
  const h = host();
  if (h?.onChannelToggleSideChat) h.onChannelToggleSideChat();
  else emit('channel-toggle-side-chat');
}
function fireChannelOpenCreateChannel(categoryId: string | null) {
  const h = host();
  if (h?.onChannelOpenCreateChannel) h.onChannelOpenCreateChannel(categoryId);
  else emit('channel-open-create-channel', categoryId);
}
function fireChannelOpenCreateCategory() {
  const h = host();
  if (h?.onChannelOpenCreateCategory) h.onChannelOpenCreateCategory();
  else emit('channel-open-create-category');
}
function fireChannelQuickCreateSubmit(
  payload: CreateChannelModalSubmitPayload,
) {
  const h = host();
  if (h?.onChannelQuickCreateSubmit) h.onChannelQuickCreateSubmit(payload);
  else emit('channel-quick-create-submit', payload);
}
function fireChannelOpenChannelSettings(payload: {
  channel: ChannelSummary;
  categoryId: string;
}) {
  const h = host();
  if (h?.onChannelOpenChannelSettings) h.onChannelOpenChannelSettings(payload);
  else emit('channel-open-channel-settings', payload);
}
function fireChannelOpenCategorySettings(categoryId: string) {
  const h = host();
  if (h?.onChannelOpenCategorySettings)
    h.onChannelOpenCategorySettings(categoryId);
  else emit('channel-open-category-settings', categoryId);
}
function fireChannelDeleteChannel(payload: { channelId: string }) {
  const h = host();
  const fn = h?.onChannelDeleteChannel;
  if (typeof fn === 'function') {
    void Promise.resolve(fn(payload)).catch((err) => {
      console.error('[AppLayoutLeftChrome] onChannelDeleteChannel failed', err);
    });
    return;
  }
  emit('channel-delete-channel', payload);
}
function fireChannelDeleteCategory(payload: { categoryId: string }) {
  const h = host();
  const fn = h?.onChannelDeleteCategory;
  if (typeof fn === 'function') {
    void Promise.resolve(fn(payload)).catch((err) => {
      console.error(
        '[AppLayoutLeftChrome] onChannelDeleteCategory failed',
        err,
      );
    });
    return;
  }
  emit('channel-delete-category', payload);
}
function fireChannelOpenNotificationSettings() {
  const h = host();
  if (h?.onChannelOpenNotificationSettings)
    h.onChannelOpenNotificationSettings();
  else emit('channel-open-notification-settings');
}
function fireChannelOpenVoiceAudioSettings() {
  const h = host();
  if (h?.onChannelOpenVoiceAudioSettings) h.onChannelOpenVoiceAudioSettings();
  else emit('channel-open-voice-audio-settings');
}
function fireChannelMarkRead(channelId: string) {
  const h = host();
  if (h?.onChannelMarkRead) h.onChannelMarkRead(channelId);
  else emit('channel-mark-read', channelId);
}
function fireChannelLeaveServer(serverId: string) {
  const h = host();
  if (h?.onChannelLeaveServer) h.onChannelLeaveServer(serverId);
  else emit('channel-leave-server', serverId);
}

function fireGuildEventRsvp(payload: {
  serverId: string;
  eventId: string;
  status: 'going' | 'declined';
}) {
  const h = host();
  if (h?.onGuildEventRsvp) void h.onGuildEventRsvp(payload);
  else emit('guild-event-rsvp', payload);
}

function fireOpenGuildEventChannel(payload: {
  serverId: string;
  channelId?: string | null;
  customLocation?: string | null;
  eventId?: string;
}) {
  const h = host();
  if (h?.onOpenGuildEventChannel) h.onOpenGuildEventChannel(payload);
  else emit('open-guild-event-channel', payload);
}

function fireDmOpenGuildEvent(payload: {
  serverId: string;
  channelId: string | null;
  customLocation?: string | null;
  eventId: string;
}) {
  fireOpenGuildEventChannel({
    serverId: payload.serverId,
    channelId: payload.channelId,
    customLocation: payload.customLocation,
    eventId: payload.eventId,
  });
}

const layoutServerRail = inject(LAYOUT_SERVER_RAIL_ACTIONS_KEY, null);

function onServerRailSettings(serverId: string) {
  if (layoutServerRail) layoutServerRail.handleServerRailSettings(serverId);
  else emit('server-rail-settings', serverId);
}
function onServerRailInvite(serverId: string) {
  if (layoutServerRail) layoutServerRail.handleServerRailInvite(serverId);
  else emit('server-rail-invite', serverId);
}
function onServerRailNotificationSettings(serverId: string) {
  if (layoutServerRail)
    layoutServerRail.handleServerRailNotificationSettings(serverId);
  else emit('server-rail-notification-settings', serverId);
}
function onServerRailMarkRead(serverId: string) {
  if (layoutServerRail) layoutServerRail.handleServerRailMarkRead(serverId);
  else emit('server-rail-mark-read', serverId);
}
function onServerRailMarkAllRead() {
  if (layoutServerRail) void layoutServerRail.handleServerRailMarkAllRead();
  else emit('server-rail-mark-all-read');
}
function onDmRailMarkAllRead() {
  if (layoutServerRail) void layoutServerRail.handleDmRailMarkAllRead();
  else emit('dm-rail-mark-all-read');
}
function onServerRailLeave(serverId: string) {
  if (layoutServerRail) layoutServerRail.handleServerRailLeave(serverId);
  else emit('server-rail-leave', serverId);
}
function onMoreServersOpenServer(serverId: string) {
  if (layoutServerRail) layoutServerRail.openServerFromMore(serverId);
  else emit('more-servers-open-server', serverId);
}
</script>

<template>
  <div
    v-if="stackChrome && stackChromeRowHasVisibleChildren"
    :class="stackChromeRootRowClass"
  >
    <!-- ServerList root is `w-full`; without a fixed-width wrapper it consumes the entire row in flex-row. -->
    <div
      v-if="!lc.hideServerRail"
      class="flex h-full min-h-0 w-24 max-w-24 shrink-0 flex-col overflow-hidden border-r border-border"
    >
      <ServerList
        :authenticated="lc.isAuthenticated"
        :active-rail-tab="lc.activeRailTab"
        :show-channel-button="
          lc.channelPanelCollapsed &&
          !lc.compactTriPaneGuildNav &&
          !lc.isDmUiContext &&
          !lc.isServerEmptyOnboarding &&
          !lc.isExploreView
        "
        :show-member-button="
          lc.memberPanelCollapsedRaw &&
          !lc.compactTriPaneGuildNav &&
          !lc.isDmUiContext &&
          !lc.isServerEmptyOnboarding &&
          !lc.isExploreView
        "
        :show-dm-list-button="
          (lc.activeRailTab === 'dm' || lc.inDmMode) &&
          !lc.dmPanelOpen &&
          !lc.isExploreView &&
          !lc.isServerEmptyOnboarding
        "
        :current-user="lc.currentUserForServerList"
        :presence-mobile-by-user-id="lc.presenceMobileByUserId"
        :dm-incoming-rail-cluster="lc.dmIncomingRailCluster"
        :server-notification-levels="lc.serverNotificationLevelsMap"
        :server-ping-kinds="lc.serverPingKindsMap"
        :server-ping-bubbles="lc.serverPingBubblesMap"
        :server-ping-channel-dots="lc.serverPingChannelDotsMap"
        :server-unread-activity-dot="lc.serverUnreadActivityDotMap"
        :server-active-voice-by-server-id="lc.serverActiveVoiceByServerId"
        :can-open-server-settings-for-server="lc.canOpenServerSettingsForServer"
        :can-open-invite-for-server="lc.canOpenInviteForServer"
        :reorder-visible-servers="lc.reorderVisibleServers"
        :bug-hunter-enabled="lc.bugHunterEnabled"
        :rail-profile-away-self-speaking="lc.railProfileAwaySelfSpeaking"
        @select-servers="fireSelectServers"
        @select-server="fireSelectServer($event)"
        @toggle-explore="fireToggleExplore"
        @toggle-dm-panel="fireToggleDmPanel"
        @select-incoming-dm="fireSelectIncomingDm($event)"
        @select-incoming-group-dm="fireSelectIncomingGroupDm($event)"
        @open-dm-inbox-overflow="fireOpenDmInboxOverflow"
        @toggle-more-servers="fireToggleMoreServers"
        @expand-channels="fireExpandChannels"
        @expand-members="fireExpandMembers"
        @open-self-profile="fireOpenSelfProfile($event)"
        @open-bug-report="fireOpenBugReport"
        @open-settings="fireOpenSettings"
        @open-auth="fireOpenAuth"
        @server-rail-settings="onServerRailSettings($event)"
        @server-rail-invite="onServerRailInvite($event)"
        @server-rail-notification-settings="
          onServerRailNotificationSettings($event)
        "
        @server-rail-mark-read="onServerRailMarkRead($event)"
        @server-rail-mark-all-read="onServerRailMarkAllRead"
        @dm-rail-mark-all-read="onDmRailMarkAllRead"
        @server-rail-leave="onServerRailLeave($event)"
      />
    </div>
    <div
      v-if="showStackChannelColumn"
      :class="[
        'relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden',
        lc.compactTriPaneGuildNav || lc.isDmUiContext
          ? 'flex-1'
          : 'w-[min(18rem,calc(100vw-7rem))] shrink-0',
      ]"
    >
      <!--
        MoreServers + DM must not sit in the column flex flow with `h-full shrink-0`:
        each child asks for the full column height, so `ChannelPanel` (flex-1) gets 0px
        height and looks "empty" on compact stack / tri-pane left.
        Overlays match the non-stack chrome pattern (DM already absolute).
      -->
      <ChannelPanel
        v-if="
          !lc.isExploreView && !lc.isDmUiContext && !lc.isServerEmptyOnboarding
        "
        class="relative z-0 min-h-0 min-w-0 flex-1"
        :show-voice-connection-panel="lc.hideChannelPanelVoiceChrome !== true"
        :loading="lc.channelPanelLoading ?? false"
        :selected-server="lc.selectedServer"
        :categories="lc.categoriesForServer"
        :users="lc.usersForChannelPanel"
        :active-channel-id="lc.activeChannelId"
        :collapsed="false"
        :bubble-mode="lc.channelPanelBubbleMode"
        :current-user-id="lc.currentUser?.id"
        :current-user="lc.currentUser"
        :current-voice-channel-id="lc.guildVoiceChannelId"
        :current-voice-channel-name="lc.guildVoiceChannelName"
        :focus-guild-voice-channel-in-sidebar="
          lc.focusGuildVoiceChannelInSidebar
        "
        :live-kit-state="lc.liveKitState"
        :live-kit-network-stats="lc.liveKitNetworkStats"
        :live-kit-room="lc.liveKitRoom"
        :get-remote-participant-volume="lc.getRemoteParticipantVolume"
        :set-remote-participant-volume="lc.setRemoteParticipantVolume"
        :vc-mic-input-level="lc.vcMicInputLevel"
        :on-switch-camera="lc.onSwitchCamera"
        :voice-session-participants="lc.voiceSessionParticipants"
        :get-vc-activity-presence="lc.getVcActivityPresence"
        :vc-activity-king-user-id="lc.vcActivityKingUserId"
        :on-open-profile="lc.openMemberProfile"
        :open-profile-user-id="lc.activeMemberProfileId"
        :vc-muted="lc.guildVcMuted"
        :vc-deafened="lc.guildVcDeafened"
        :vc-video="lc.guildVcVideo"
        :vc-screenshare="lc.guildVcScreenshare"
        :can-use-video="lc.canUseVideo"
        :can-join-voice="lc.canJoinPreviewVoiceChannel"
        :side-chat-collapsed="lc.voiceSideChatCollapsed"
        :can-create-channels="lc.canCreateChannels"
        :handle-channel-reorder="lc.handleChannelReorder"
        :handle-category-reorder="lc.handleCategoryReorder"
        :can-manage-this-channel="lc.canManageThisChannel"
        :resize-handlers="{
          onResizeStart: lc.startChannelResize,
          onReset: lc.resetChannelWidth,
        }"
        :channel-missed-activity-by-channel-id="
          lc.channelMissedActivityByChannelId
        "
        :mobile-voice-channel-tap-opens-lobby="
          lc.mobileVoiceChannelTapOpensLobby
        "
        :voice-lobby-channel-id="lc.voiceLobbyChannelId"
        :show-server-settings-menu-item="lc.showServerSettingsMenuItem"
        :can-invite="lc.canInviteToCurrentServer"
        :can-moderate-user="lc.canModerateMemberInServer"
        :can-vc-moderate-member="lc.canVcModerateMember"
        :on-moderate-user="lc.handleModerateUser"
        :on-vc-moderate="lc.handleVcModerate"
        :on-message-user="lc.selectDmUser"
        @update:active-channel-id="fireChannelUpdateActiveId($event)"
        @update:collapsed="fireChannelUpdateCollapsed($event)"
        @update:vc-muted="fireChannelUpdateVcMuted($event)"
        @update:vc-deafened="fireChannelUpdateVcDeafened($event)"
        @update:vc-video="fireChannelUpdateVcVideo($event)"
        @update:vc-screenshare="fireChannelUpdateVcScreenshare($event)"
        @join-voice="fireChannelJoinVoice($event)"
        @open-voice-lobby="fireChannelOpenVoiceLobby($event)"
        @leave-voice="fireChannelLeaveVoice"
        @invite="fireChannelInvite"
        @open-server-settings="fireChannelOpenServerSettings"
        @toggle-side-chat="fireChannelToggleSideChat"
        @open-create-channel="fireChannelOpenCreateChannel($event)"
        @open-create-category="fireChannelOpenCreateCategory"
        @quick-create-submit="fireChannelQuickCreateSubmit($event)"
        @open-channel-settings="fireChannelOpenChannelSettings($event)"
        @open-category-settings="fireChannelOpenCategorySettings($event)"
        @delete-channel="fireChannelDeleteChannel($event)"
        @delete-category="fireChannelDeleteCategory($event)"
        @open-notification-settings="fireChannelOpenNotificationSettings"
        @open-voice-audio-settings="fireChannelOpenVoiceAudioSettings"
        @leave-server="fireChannelLeaveServer($event)"
        @mark-read="fireChannelMarkRead($event)"
        @guild-event-rsvp="fireGuildEventRsvp($event)"
        @open-guild-event-channel="fireOpenGuildEventChannel($event)"
      />
      <div
        class="pointer-events-none absolute inset-0 z-[35] min-h-0 min-w-0 overflow-hidden"
        :class="{ 'pointer-events-auto': lc.isMoreServersPanelOpen }"
      >
        <MoreServersPanel
          :open="lc.isMoreServersPanelOpen"
          :compact="lc.isMoreServersCompact"
          :pinned="lc.isMoreServersPinned"
          :can-open-invite-for-server="lc.canOpenInviteForServer"
          @close="fireMoreServersClose"
          @set-compact="fireMoreServersSetCompact($event)"
          @toggle-pinned="fireMoreServersTogglePinned"
          @pin-server="serverStore.pinMoreServer($event)"
          @unpin-server="serverStore.unpinMoreServer($event)"
          @open-server="onMoreServersOpenServer($event)"
          @invite-server="onServerRailInvite($event)"
          @leave-server="fireChannelLeaveServer($event)"
        />
      </div>
      <div
        class="pointer-events-none absolute inset-0 z-[36] min-h-0 min-w-0 overflow-hidden"
        :class="{ 'pointer-events-auto': lc.dmPanelOpen }"
      >
        <DMPanel
          class="absolute inset-0"
          :open="lc.dmPanelOpen"
          :guest-friends-locked="lc.guestFriendsLocked ?? false"
          :active-tab="lc.dmActiveTab"
          :users="lc.usersForChannelPanel"
          :dm-inbox-entries="lc.dmInboxEntries"
          :is-dm-inbox-user-favorite="lc.isDmInboxUserFavorite"
          :is-dm-inbox-group-favorite="lc.isDmInboxGroupFavorite"
          :current-user-id="lc.currentUserId"
          :selected-user-id="lc.selectedDmUserId"
          :selected-group-dm-channel-id="lc.selectedGroupDmChannelId ?? null"
          :selected-message-request-id="lc.selectedMessageRequestId"
          :friend-ids="lc.friendIds"
          :message-requests="lc.messageRequests as any"
          :friend-requests-incoming="lc.friendRequestsIncoming as any"
          :friend-requests-outgoing="lc.friendRequestsOutgoing as any"
          :dm-mention-notifications="lc.dmMentionNotifications"
          :dm-notification-read-state-by-channel-id="
            lc.dmNotificationReadStateByChannelId
          "
          :mention-notification-categories-by-server="
            lc.mentionNotificationCategoriesByServer
          "
          :mention-notification-servers="lc.mentionNotificationServers"
          :is-persisted-echo-dm-thread="lc.isPersistedEchoDmThread"
          :dm-notifications-read-preset="lc.dmNotificationsReadPreset"
          :dm-notifications-source-key="lc.dmNotificationsSourceKey"
          :dm-call-with-user-id="lc.dmCallWithUserId ?? null"
          :dm-call-ringing="lc.dmCallRinging ?? false"
          :dm-call-ring-remote-vanishing="lc.dmCallRingRemoteVanishing ?? false"
          :phone-call-icon="lc.phoneCallIcon"
          :presence-by-user-id="lc.presenceByUserId"
          :presence-mobile-by-user-id="lc.presenceMobileByUserId"
          :guild-voice-activity-cards="lc.guildVoiceActivityCards"
          :guild-event-activity-cards="lc.guildEventActivityCards"
          :guild-voice-activity-current-voice-channel-id="
            lc.guildVoiceActivityCurrentVoiceChannelId
          "
          :can-join-guild-voice-for-activity="lc.canJoinPreviewVoiceChannel"
          @close="fireDmClose"
          @update:active-tab="fireDmUpdateActiveTab($event)"
          @select-dm="fireDmSelectDm($event)"
          @select-dm-group="fireDmSelectGroup($event)"
          @select-message-request="fireDmSelectMessageRequest($event)"
          @mark-read="fireDmMarkRead($event)"
          @hide-from-dm-list="fireDmHideFromInbox($event)"
          @toggle-favorite-dm-inbox="fireDmToggleFavoriteInbox($event)"
          @join-guild-voice-activity="fireDmJoinGuildVoiceActivity($event)"
          @open-guild-event-activity="fireDmOpenGuildEvent($event)"
          @request-upgrade="fireDmRequestUpgrade"
          @update:dm-notifications-read-preset="
            fireDmUpdateNotificationsReadPreset($event)
          "
          @update:dm-notifications-source-key="
            fireDmUpdateNotificationsSourceKey($event)
          "
          :show-guild-voice-connection-strip="
            lc.hideChannelPanelVoiceChrome !== true
          "
          :guild-voice-strip-categories="lc.categoriesForServer"
          :guild-voice-channel-id="lc.guildVoiceChannelId"
          :guild-voice-channel-name="lc.guildVoiceChannelName"
          :guild-vc-muted="lc.guildVcMuted"
          :guild-vc-deafened="lc.guildVcDeafened"
          :guild-vc-video="lc.guildVcVideo"
          :guild-vc-screenshare="lc.guildVcScreenshare"
          :guild-voice-can-use-video="lc.canUseVideo"
          :guild-voice-live-kit-state="lc.liveKitState"
          :guild-voice-live-kit-network-stats="lc.liveKitNetworkStats"
          :guild-voice-live-kit-room="lc.liveKitRoom"
          :guild-voice-session-participants="lc.voiceSessionParticipants"
          :guild-voice-mic-input-level="lc.vcMicInputLevel"
          :on-guild-voice-switch-camera="lc.onSwitchCamera"
          :focus-guild-voice-channel-in-sidebar="
            lc.focusGuildVoiceChannelInSidebar
          "
          @update:guild-vc-muted="fireChannelUpdateVcMuted($event)"
          @update:guild-vc-deafened="fireChannelUpdateVcDeafened($event)"
          @update:guild-vc-video="fireChannelUpdateVcVideo($event)"
          @update:guild-vc-screenshare="fireChannelUpdateVcScreenshare($event)"
          @leave-guild-voice="fireChannelLeaveVoice"
          @open-guild-voice-audio-settings="fireChannelOpenVoiceAudioSettings"
          :on-guild-vc-strip-participant-context-menu="
            onGuildVcStripParticipantContextMenu
          "
        />
        <div
          v-if="lc.dmPanelOpen"
          class="absolute top-0 right-0 bottom-0 z-[40] flex w-2 cursor-col-resize items-center justify-center group"
          aria-label="Resize direct messages"
          @mousedown="fireDmPanelResizeStart($event)"
          @dblclick="fireDmPanelResizeReset"
        >
          <span
            class="h-8 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-glass-active"
          />
        </div>
      </div>
    </div>
  </div>
  <template v-else-if="!stackChrome">
    <div
      v-if="actionRailTopLayout && !lc.hideServerRail"
      class="app-layout__top-action-rail flex h-[60px] min-h-[60px] w-full min-w-0 shrink-0 items-center overflow-x-hidden overflow-y-visible border-b border-border bg-[var(--echo-server-rail-bg)]"
    >
      <ServerList
        layout="horizontal"
        v-bind="serverListBindings"
        @select-servers="fireSelectServers"
        @select-server="fireSelectServer($event)"
        @toggle-explore="fireToggleExplore"
        @toggle-dm-panel="fireToggleDmPanel"
        @select-incoming-dm="fireSelectIncomingDm($event)"
        @select-incoming-group-dm="fireSelectIncomingGroupDm($event)"
        @open-dm-inbox-overflow="fireOpenDmInboxOverflow"
        @toggle-more-servers="fireToggleMoreServers"
        @expand-channels="fireExpandChannels"
        @expand-members="fireExpandMembers"
        @open-self-profile="fireOpenSelfProfile($event)"
        @open-bug-report="fireOpenBugReport"
        @open-settings="fireOpenSettings"
        @open-auth="fireOpenAuth"
        @server-rail-settings="onServerRailSettings($event)"
        @server-rail-invite="onServerRailInvite($event)"
        @server-rail-notification-settings="
          onServerRailNotificationSettings($event)
        "
        @server-rail-mark-read="onServerRailMarkRead($event)"
        @server-rail-mark-all-read="onServerRailMarkAllRead"
        @dm-rail-mark-all-read="onDmRailMarkAllRead"
        @server-rail-leave="onServerRailLeave($event)"
      />
    </div>
    <div class="contents">
      <ServerList
        v-if="!lc.hideServerRail && !actionRailTopLayout"
        v-bind="serverListBindings"
        @select-servers="fireSelectServers"
        @select-server="fireSelectServer($event)"
        @toggle-explore="fireToggleExplore"
        @toggle-dm-panel="fireToggleDmPanel"
        @select-incoming-dm="fireSelectIncomingDm($event)"
        @select-incoming-group-dm="fireSelectIncomingGroupDm($event)"
        @open-dm-inbox-overflow="fireOpenDmInboxOverflow"
        @toggle-more-servers="fireToggleMoreServers"
        @expand-channels="fireExpandChannels"
        @expand-members="fireExpandMembers"
        @open-self-profile="fireOpenSelfProfile($event)"
        @open-bug-report="fireOpenBugReport"
        @open-settings="fireOpenSettings"
        @open-auth="fireOpenAuth"
        @server-rail-settings="onServerRailSettings($event)"
        @server-rail-invite="onServerRailInvite($event)"
        @server-rail-notification-settings="
          onServerRailNotificationSettings($event)
        "
        @server-rail-mark-read="onServerRailMarkRead($event)"
        @server-rail-mark-all-read="onServerRailMarkAllRead"
        @dm-rail-mark-all-read="onDmRailMarkAllRead"
        @server-rail-leave="onServerRailLeave($event)"
      />
      <div class="relative h-full min-w-0 overflow-hidden">
        <MoreServersPanel
          :open="lc.isMoreServersPanelOpen"
          :compact="lc.isMoreServersCompact"
          :pinned="lc.isMoreServersPinned"
          :can-open-invite-for-server="lc.canOpenInviteForServer"
          @close="fireMoreServersClose"
          @set-compact="fireMoreServersSetCompact($event)"
          @toggle-pinned="fireMoreServersTogglePinned"
          @pin-server="serverStore.pinMoreServer($event)"
          @unpin-server="serverStore.unpinMoreServer($event)"
          @open-server="onMoreServersOpenServer($event)"
          @invite-server="onServerRailInvite($event)"
          @leave-server="fireChannelLeaveServer($event)"
        />
      </div>
      <div class="relative h-full min-w-0 overflow-hidden">
        <DMPanel
          class="absolute inset-0"
          :open="lc.dmPanelOpen"
          :guest-friends-locked="lc.guestFriendsLocked ?? false"
          :active-tab="lc.dmActiveTab"
          :users="lc.usersForChannelPanel"
          :dm-inbox-entries="lc.dmInboxEntries"
          :is-dm-inbox-user-favorite="lc.isDmInboxUserFavorite"
          :is-dm-inbox-group-favorite="lc.isDmInboxGroupFavorite"
          :current-user-id="lc.currentUserId"
          :selected-user-id="lc.selectedDmUserId"
          :selected-group-dm-channel-id="lc.selectedGroupDmChannelId ?? null"
          :selected-message-request-id="lc.selectedMessageRequestId"
          :friend-ids="lc.friendIds"
          :message-requests="lc.messageRequests as any"
          :friend-requests-incoming="lc.friendRequestsIncoming as any"
          :friend-requests-outgoing="lc.friendRequestsOutgoing as any"
          :dm-mention-notifications="lc.dmMentionNotifications"
          :dm-notification-read-state-by-channel-id="
            lc.dmNotificationReadStateByChannelId
          "
          :mention-notification-categories-by-server="
            lc.mentionNotificationCategoriesByServer
          "
          :mention-notification-servers="lc.mentionNotificationServers"
          :is-persisted-echo-dm-thread="lc.isPersistedEchoDmThread"
          :dm-notifications-read-preset="lc.dmNotificationsReadPreset"
          :dm-notifications-source-key="lc.dmNotificationsSourceKey"
          :dm-call-with-user-id="lc.dmCallWithUserId ?? null"
          :dm-call-ringing="lc.dmCallRinging ?? false"
          :dm-call-ring-remote-vanishing="lc.dmCallRingRemoteVanishing ?? false"
          :phone-call-icon="lc.phoneCallIcon"
          :presence-by-user-id="lc.presenceByUserId"
          :presence-mobile-by-user-id="lc.presenceMobileByUserId"
          :guild-voice-activity-cards="lc.guildVoiceActivityCards"
          :guild-event-activity-cards="lc.guildEventActivityCards"
          :guild-voice-activity-current-voice-channel-id="
            lc.guildVoiceActivityCurrentVoiceChannelId
          "
          :can-join-guild-voice-for-activity="lc.canJoinPreviewVoiceChannel"
          @close="fireDmClose"
          @update:active-tab="fireDmUpdateActiveTab($event)"
          @select-dm="fireDmSelectDm($event)"
          @select-dm-group="fireDmSelectGroup($event)"
          @select-message-request="fireDmSelectMessageRequest($event)"
          @mark-read="fireDmMarkRead($event)"
          @hide-from-dm-list="fireDmHideFromInbox($event)"
          @toggle-favorite-dm-inbox="fireDmToggleFavoriteInbox($event)"
          @join-guild-voice-activity="fireDmJoinGuildVoiceActivity($event)"
          @open-guild-event-activity="fireDmOpenGuildEvent($event)"
          @request-upgrade="fireDmRequestUpgrade"
          @update:dm-notifications-read-preset="
            fireDmUpdateNotificationsReadPreset($event)
          "
          @update:dm-notifications-source-key="
            fireDmUpdateNotificationsSourceKey($event)
          "
          :show-guild-voice-connection-strip="
            lc.hideChannelPanelVoiceChrome !== true
          "
          :guild-voice-strip-categories="lc.categoriesForServer"
          :guild-voice-channel-id="lc.guildVoiceChannelId"
          :guild-voice-channel-name="lc.guildVoiceChannelName"
          :guild-vc-muted="lc.guildVcMuted"
          :guild-vc-deafened="lc.guildVcDeafened"
          :guild-vc-video="lc.guildVcVideo"
          :guild-vc-screenshare="lc.guildVcScreenshare"
          :guild-voice-can-use-video="lc.canUseVideo"
          :guild-voice-live-kit-state="lc.liveKitState"
          :guild-voice-live-kit-network-stats="lc.liveKitNetworkStats"
          :guild-voice-live-kit-room="lc.liveKitRoom"
          :guild-voice-session-participants="lc.voiceSessionParticipants"
          :guild-voice-mic-input-level="lc.vcMicInputLevel"
          :on-guild-voice-switch-camera="lc.onSwitchCamera"
          @update:guild-vc-muted="fireChannelUpdateVcMuted($event)"
          @update:guild-vc-deafened="fireChannelUpdateVcDeafened($event)"
          @update:guild-vc-video="fireChannelUpdateVcVideo($event)"
          @update:guild-vc-screenshare="fireChannelUpdateVcScreenshare($event)"
          @leave-guild-voice="fireChannelLeaveVoice"
          @open-guild-voice-audio-settings="fireChannelOpenVoiceAudioSettings"
          :on-guild-vc-strip-participant-context-menu="
            onGuildVcStripParticipantContextMenu
          "
        />
        <div
          v-if="lc.dmPanelOpen"
          class="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-[40] flex items-center justify-center group"
          aria-label="Resize direct messages"
          @mousedown="fireDmPanelResizeStart($event)"
          @dblclick="fireDmPanelResizeReset"
        >
          <span
            class="w-0.5 h-8 rounded-full bg-transparent group-hover:bg-glass-active transition-colors"
          />
        </div>
      </div>
      <ChannelPanel
        v-if="
          !lc.isExploreView && !lc.isDmUiContext && !lc.isServerEmptyOnboarding
        "
        :show-voice-connection-panel="lc.hideChannelPanelVoiceChrome !== true"
        :loading="lc.channelPanelLoading ?? false"
        :selected-server="lc.selectedServer"
        :categories="lc.categoriesForServer"
        :users="lc.usersForChannelPanel"
        :active-channel-id="lc.activeChannelId"
        :collapsed="lc.channelPanelCollapsed"
        :bubble-mode="lc.channelPanelBubbleMode"
        :current-user-id="lc.currentUser?.id"
        :current-user="lc.currentUser"
        :current-voice-channel-id="lc.guildVoiceChannelId"
        :current-voice-channel-name="lc.guildVoiceChannelName"
        :focus-guild-voice-channel-in-sidebar="
          lc.focusGuildVoiceChannelInSidebar
        "
        :live-kit-state="lc.liveKitState"
        :live-kit-network-stats="lc.liveKitNetworkStats"
        :live-kit-room="lc.liveKitRoom"
        :get-remote-participant-volume="lc.getRemoteParticipantVolume"
        :set-remote-participant-volume="lc.setRemoteParticipantVolume"
        :vc-mic-input-level="lc.vcMicInputLevel"
        :on-switch-camera="lc.onSwitchCamera"
        :voice-session-participants="lc.voiceSessionParticipants"
        :get-vc-activity-presence="lc.getVcActivityPresence"
        :vc-activity-king-user-id="lc.vcActivityKingUserId"
        :on-open-profile="lc.openMemberProfile"
        :open-profile-user-id="lc.activeMemberProfileId"
        :vc-muted="lc.guildVcMuted"
        :vc-deafened="lc.guildVcDeafened"
        :vc-video="lc.guildVcVideo"
        :vc-screenshare="lc.guildVcScreenshare"
        :can-use-video="lc.canUseVideo"
        :can-join-voice="lc.canJoinPreviewVoiceChannel"
        :side-chat-collapsed="lc.voiceSideChatCollapsed"
        :can-create-channels="lc.canCreateChannels"
        :handle-channel-reorder="lc.handleChannelReorder"
        :handle-category-reorder="lc.handleCategoryReorder"
        :can-manage-this-channel="lc.canManageThisChannel"
        :resize-handlers="{
          onResizeStart: lc.startChannelResize,
          onReset: lc.resetChannelWidth,
        }"
        :channel-missed-activity-by-channel-id="
          lc.channelMissedActivityByChannelId
        "
        :mobile-voice-channel-tap-opens-lobby="
          lc.mobileVoiceChannelTapOpensLobby
        "
        :voice-lobby-channel-id="lc.voiceLobbyChannelId"
        :show-server-settings-menu-item="lc.showServerSettingsMenuItem"
        :can-invite="lc.canInviteToCurrentServer"
        :can-moderate-user="lc.canModerateMemberInServer"
        :can-vc-moderate-member="lc.canVcModerateMember"
        :on-moderate-user="lc.handleModerateUser"
        :on-vc-moderate="lc.handleVcModerate"
        :on-message-user="lc.selectDmUser"
        @update:active-channel-id="fireChannelUpdateActiveId($event)"
        @update:collapsed="fireChannelUpdateCollapsed($event)"
        @update:vc-muted="fireChannelUpdateVcMuted($event)"
        @update:vc-deafened="fireChannelUpdateVcDeafened($event)"
        @update:vc-video="fireChannelUpdateVcVideo($event)"
        @update:vc-screenshare="fireChannelUpdateVcScreenshare($event)"
        @join-voice="fireChannelJoinVoice($event)"
        @open-voice-lobby="fireChannelOpenVoiceLobby($event)"
        @leave-voice="fireChannelLeaveVoice"
        @invite="fireChannelInvite"
        @open-server-settings="fireChannelOpenServerSettings"
        @toggle-side-chat="fireChannelToggleSideChat"
        @open-create-channel="fireChannelOpenCreateChannel($event)"
        @open-create-category="fireChannelOpenCreateCategory"
        @quick-create-submit="fireChannelQuickCreateSubmit($event)"
        @open-channel-settings="fireChannelOpenChannelSettings($event)"
        @open-category-settings="fireChannelOpenCategorySettings($event)"
        @delete-channel="fireChannelDeleteChannel($event)"
        @delete-category="fireChannelDeleteCategory($event)"
        @open-notification-settings="fireChannelOpenNotificationSettings"
        @open-voice-audio-settings="fireChannelOpenVoiceAudioSettings"
        @leave-server="fireChannelLeaveServer($event)"
        @mark-read="fireChannelMarkRead($event)"
        @guild-event-rsvp="fireGuildEventRsvp($event)"
        @open-guild-event-channel="fireOpenGuildEventChannel($event)"
      />
    </div>
  </template>

  <!-- Guild VC strip participant context menu -->
  <ChannelPanelContextMenu
    :menu-open="vcStripMenuOpen"
    :menu-ref="vcStripMenuRef"
    :panel-context="vcStripPanelContext"
    :selected-server-id="vcStripContext?.serverId ?? null"
    :menu-position="vcStripMenuPosition"
    :dev-mode-ids-enabled="devModeIdsEnabled"
    :row-can-manage-channel="() => false"
    :can-create-channels="false"
    :vc-context-is-self="vcStripIsSelf"
    :vc-context-show-voice-mod="vcStripShowVoiceMod"
    :show-vc-mention-in-chat="false"
    :vc-menu-can-mute="vcStripCanMute"
    :vc-menu-can-deafen="vcStripCanDeafen"
    :vc-menu-can-disconnect="vcStripCanDisconnect"
    :vc-menu-can-move="vcStripVcMenuCanMove"
    :vc-move-picker-expanded="vcStripMovePickerExpanded"
    :vc-move-targets="vcStripMoveTargets"
    :vc-menu-server-muted="vcStripParticipantState?.serverMuted ?? false"
    :vc-menu-server-deafened="vcStripParticipantState?.serverDeafened ?? false"
    :can-moderate-user="
      !!(
        lc.canModerateMemberInServer &&
        vcStripContext &&
        lc.canModerateMemberInServer(vcStripContext.userId)
      )
    "
    :get-remote-participant-volume="lc.getRemoteParticipantVolume"
    :set-remote-participant-volume="lc.setRemoteParticipantVolume"
    @vc-menu-profile="vcStripMenuProfile"
    @vc-menu-copy-user-id="vcStripMenuCopyUserId"
    @vc-menu-move-toggle="vcStripMoveToggle"
    @vc-menu-move-pick="vcStripMovePick"
    @vc-moderate="vcStripModerate($event)"
    @vc-moderate-server="vcStripModerateServer($event)"
  />
</template>
