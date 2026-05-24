<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { Server } from '@shared/types';
import { useServerStore, EXTRA_SERVERS_RAIL_MIN_JOINED } from '@/stores/server';
import { getPopoutAnchorRect } from '@/utils/memberProfiles';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import { useMoreServers } from '@/composables/useMoreServers';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import type {
  ServerPingChannelDotsForServerRail,
  ServerPingKind,
} from '@/features/server-notifications/serverPing';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { useDevSettingsStore } from '@/stores/devSettings';
import { linkTokenServer } from '@/utils/idTokens';
import { shouldOfferLeaveServerInClientUi } from '@/utils/echoServerOwnership';
import { usePlatform } from '@/platform/usePlatform';
import { VISIBLE_SERVER_RAIL_SLOT_COUNT } from '@/utils/serverRailReorder';

import { useServerRailReorder } from '@/features/layout/composables/useServerRailReorder';
import ServerRailContextMenu from '@/features/layout/components/server-rail/ServerRailContextMenu.vue';
import ServerRailLaneContextMenu from '@/features/layout/components/server-rail/ServerRailLaneContextMenu.vue';
import EchoRailCorner from '@/features/layout/components/server-rail/EchoRailCorner.vue';
import ServerRailCenterColumn from '@/features/layout/components/server-rail/ServerRailCenterColumn.vue';
import RailProfileBar from '@/features/layout/components/server-rail/RailProfileBar.vue';

const serverStore = useServerStore();
const { isMockDataMode } = usePlatform();
const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);
const { servers, visibleServers, selectedServerId } = storeToRefs(serverStore);
const { moreServersCount } = useMoreServers();

const dmIncomingRailAvatars = computed(
  () => props.dmIncomingRailCluster?.avatars ?? [],
);
const dmIncomingRailOverflow = computed(
  () => props.dmIncomingRailCluster?.overflowCount ?? 0,
);
const dmIncomingRailTotalUnread = computed(
  () => props.dmIncomingRailCluster?.totalUnreadCount ?? 0,
);
const showDmIncomingRailCluster = computed(
  () => props.authenticated && dmIncomingRailAvatars.value.length > 0,
);

/** Extra-servers panel is only relevant once the main rail overflows its primary slots. */
const showExtraServersRailButton = computed(
  () => servers.value.length >= EXTRA_SERVERS_RAIL_MIN_JOINED,
);
const notificationPreferencesStore = useNotificationPreferencesStore();

const props = defineProps<{
  /** When false, only the Echo menu and Log in control are shown on the rail (guests). */
  authenticated: boolean;
  activeRailTab?: 'servers' | 'explore' | 'dm';
  showChannelButton?: boolean;
  showMemberButton?: boolean;
  showDmListButton?: boolean;
  currentUser?: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
  } | null;
  /** Per-server notification override (mock); drives rail badges. */
  serverNotificationLevels?: Record<string, ServerNotificationLevel>;
  /** Unread mention severity per server (legacy; bubble uses serverPingBubbles). */
  serverPingKinds?: Record<string, ServerPingKind>;
  /** Ping tier + count for server rail bubble. */
  serverPingBubbles?: Record<string, ServerPingBubbleDisplay>;
  /** Per-channel ping dots on each server icon. */
  serverPingChannelDots?: Record<string, ServerPingChannelDotsForServerRail>;
  /** Non-mention unread: white activity mark on server row (compact). */
  serverUnreadActivityDot?: Record<string, true>;
  /** True when a server currently has an active voice channel. */
  serverActiveVoiceByServerId?: Record<string, boolean>;
  /** If set, hide “Server settings” in the rail context menu when this returns false. */
  canOpenServerSettingsForServer?: (serverId: string) => boolean;
  /** Echo CREATE_INVITE — hide “Invite people” in the rail context menu when false for that guild. */
  canOpenInviteForServer?: (serverId: string) => boolean;
  /** When set and 2+ rail slots, icons can be drag-reordered on the rail. */
  reorderVisibleServers?: (
    fromIndex: number,
    toIndex: number,
    overflowServerId?: string | null,
  ) => void;
  /** Unread DM threads (1:1 or group), newest first; overflow is extra count beyond three avatars. */
  dmIncomingRailCluster?: {
    avatars: Array<
      | {
          kind: 'user';
          userId: string;
          name: string;
          pfp: string;
          unreadCount: number;
          inCall?: boolean;
        }
      | {
          kind: 'group';
          channelId: string;
          name: string;
          pfp: string;
          unreadCount: number;
          inCall?: boolean;
        }
    >;
    overflowCount: number;
    totalUnreadCount: number;
  };
  /** Advanced setting: show Bug Hunter rail control above PFP. */
  bugHunterEnabled?: boolean;
  /** Speaking ring on rail PFP when in voice/call but main surface is elsewhere. */
  railProfileAwaySelfSpeaking?: boolean;
  presenceMobileByUserId?: Record<string, true>;
  /** Desktop top strip layout (Appearance → Action rail). */
  layout?: 'vertical' | 'horizontal';
}>();

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
  'open-auth': [];
  'open-settings': [];
  'server-rail-settings': [serverId: string];
  'server-rail-invite': [serverId: string];
  'server-rail-notification-settings': [serverId: string];
  'server-rail-mark-read': [serverId: string];
  'server-rail-mark-all-read': [];
  'dm-rail-mark-all-read': [];
  'server-rail-leave': [serverId: string];
  'open-bug-report': [];
}>();

const {
  menuOpen,
  menuRef: _menuRef,
  menuPosition,
  openAtEvent,
  closeMenu,
} = useSimpleContextMenu();
const {
  menuOpen: laneMenuOpen,
  menuRef: _laneMenuRef,
  menuPosition: laneMenuPosition,
  openAtEvent: openLaneMenuAtEvent,
  closeMenu: closeLaneMenu,
} = useSimpleContextMenu();
const contextServer = ref<Server | null>(null);
const laneMenuScope = ref<'servers' | 'dm' | null>(null);

/** Horizontal action rail: selected guild not in the fixed visible slice (draggable overflow slot). */
const selectedOverflowServer = computed<Server | null>(() => {
  if (!horizontalRail.value || !showExtraServersRailButton.value) return null;
  const selectedId = selectedServerId.value;
  if (!selectedId) return null;
  if (visibleServersForRail.value.some((server) => server.id === selectedId)) {
    return null;
  }
  return servers.value.find((server) => server.id === selectedId) ?? null;
});

/** Visible icons plus optional overflow “recent” slot for pointer reorder. */
const railReorderSlotCount = computed(
  () =>
    visibleServersForRail.value.length + (selectedOverflowServer.value ? 1 : 0),
);

const reorderEnabled = computed(
  () =>
    props.authenticated &&
    typeof props.reorderVisibleServers === 'function' &&
    railReorderSlotCount.value > 1,
);

function handleReorderVisibleServers(fromIndex: number, toIndex: number) {
  props.reorderVisibleServers?.(
    fromIndex,
    toIndex,
    selectedOverflowServer.value?.id ?? null,
  );
}

const railOrientation = computed(() =>
  props.layout === 'horizontal' ? 'horizontal' : 'vertical',
);
const horizontalRail = computed(() => props.layout === 'horizontal');

/** Rail shows at most {@link VISIBLE_SERVER_RAIL_SLOT_COUNT} guild icons; overflow selection uses the “more” cluster + pill. */
const visibleServersForRail = computed(() => visibleServers.value);

const {
  railDragSourceIndex,
  railDropLineBefore,
  railGhostPosition,
  onRailServerPointerDown,
  onRailServerDragEnd,
  consumeRailSelectIntent,
} = useServerRailReorder(
  reorderEnabled,
  railReorderSlotCount,
  handleReorderVisibleServers,
  railOrientation,
  showExtraServersRailButton,
);

const railDragGhostServer = computed(() => {
  const i = railDragSourceIndex.value;
  if (i === null) return null;
  const overflow = selectedOverflowServer.value;
  if (overflow && i === visibleServersForRail.value.length) return overflow;
  return visibleServersForRail.value[i] ?? null;
});

function onRailWindowBlurEnd() {
  onRailServerDragEnd();
}

function onRailWindowVisibilityChange() {
  if (document.hidden) {
    onRailServerDragEnd();
  }
}

onMounted(() => {
  window.addEventListener('blur', onRailWindowBlurEnd);
  document.addEventListener('visibilitychange', onRailWindowVisibilityChange);
});

onBeforeUnmount(() => {
  onRailServerDragEnd();
  window.removeEventListener('blur', onRailWindowBlurEnd);
  document.removeEventListener(
    'visibilitychange',
    onRailWindowVisibilityChange,
  );
});

async function onServerContextMenu(server: Server, e: MouseEvent) {
  laneMenuScope.value = null;
  closeLaneMenu();
  contextServer.value = server;
  await openAtEvent(e);
}

async function onServersLaneContextMenu(e: MouseEvent) {
  contextServer.value = null;
  closeMenu();
  laneMenuScope.value = 'servers';
  await openLaneMenuAtEvent(e);
}

async function onDmLaneContextMenu(e: MouseEvent) {
  contextServer.value = null;
  closeMenu();
  laneMenuScope.value = 'dm';
  await openLaneMenuAtEvent(e);
}

function closeLaneContextMenu() {
  closeLaneMenu();
  laneMenuScope.value = null;
}

function emitLaneMarkAllReadAndClose() {
  if (laneMenuScope.value === 'servers') {
    emit('server-rail-mark-all-read');
  } else if (laneMenuScope.value === 'dm') {
    emit('dm-rail-mark-all-read');
  }
  closeLaneContextMenu();
}

function emitRailAndClose(emitFn: () => void) {
  emitFn();
  closeMenu();
  contextServer.value = null;
}

function copyServerIdFromRailMenu() {
  const s = contextServer.value;
  if (!s) return;
  copyToClipboard(linkTokenServer(s.id));
  closeMenu();
  contextServer.value = null;
}

function canLeaveContextServer(): boolean {
  const s = contextServer.value;
  if (!s) return true;
  return shouldOfferLeaveServerInClientUi(
    s,
    props.currentUser?.id,
    devModeIdsEnabled.value,
  );
}

const areServersExpanded = computed(() => props.activeRailTab === 'servers');
/** Servers folder / rail intent; controller resolves the target server/channel synchronously. */
function openServersRail() {
  emit('select-servers');
}

function openSelfProfile(event: MouseEvent) {
  emit(
    'open-self-profile',
    getPopoutAnchorRect(event.currentTarget, 'self-bar'),
  );
}
</script>

<template>
  <nav
    aria-label="Servers"
    class="bg-[var(--echo-server-rail-bg)]"
    :class="
      props.layout === 'horizontal'
        ? 'relative flex h-full min-h-[60px] w-full min-w-0 flex-row items-stretch overflow-x-hidden overflow-y-visible'
        : 'relative flex h-full min-h-0 w-full flex-col'
    "
  >
    <!-- Top Section -->
    <EchoRailCorner
      :authenticated="props.authenticated"
      :compact-top-bar="props.layout === 'horizontal'"
      @open-settings="emit('open-settings')"
    />

    <div
      :class="
        props.layout === 'horizontal'
          ? 'flex min-w-0 flex-1 items-center justify-center overflow-x-hidden overflow-y-visible'
          : 'contents'
      "
    >
      <ServerRailCenterColumn
        :authenticated="props.authenticated"
        :active-rail-tab="activeRailTab"
        :show-dm-incoming-rail-cluster="showDmIncomingRailCluster"
        :dm-incoming-rail-avatars="dmIncomingRailAvatars"
        :dm-incoming-rail-overflow="dmIncomingRailOverflow"
        :dm-incoming-rail-total-unread="dmIncomingRailTotalUnread"
        :visible-servers="visibleServersForRail"
        :selected-server-id="selectedServerId"
        :are-servers-expanded="areServersExpanded"
        :reorder-enabled="reorderEnabled"
        :rail-drag-source-index="railDragSourceIndex"
        :rail-drop-line-before="railDropLineBefore"
        :rail-ghost-position="railGhostPosition"
        :rail-drag-ghost-server="railDragGhostServer"
        :before-select-server="consumeRailSelectIntent"
        :show-extra-servers-rail-button="showExtraServersRailButton"
        :more-servers-count="moreServersCount"
        :selected-overflow-server="selectedOverflowServer"
        :server-notification-levels="props.serverNotificationLevels"
        :server-ping-kinds="props.serverPingKinds"
        :server-ping-bubbles="props.serverPingBubbles"
        :server-ping-channel-dots="props.serverPingChannelDots"
        :server-unread-activity-dot="props.serverUnreadActivityDot"
        :server-active-voice-by-server-id="props.serverActiveVoiceByServerId"
        :unread-badge-enabled="
          notificationPreferencesStore.settings.unreadBadge
        "
        :is-mock-data-mode="isMockDataMode"
        :show-channel-button="props.showChannelButton"
        :show-member-button="props.showMemberButton"
        :show-dm-list-button="props.showDmListButton"
        @toggle-dm-panel="emit('toggle-dm-panel')"
        @select-incoming-dm="emit('select-incoming-dm', $event)"
        @select-incoming-group-dm="emit('select-incoming-group-dm', $event)"
        @open-dm-inbox-overflow="emit('open-dm-inbox-overflow')"
        @open-servers-rail="openServersRail"
        @toggle-explore="emit('toggle-explore')"
        @open-auth="emit('open-auth')"
        @expand-channels="emit('expand-channels')"
        @expand-members="emit('expand-members')"
        @toggle-more-servers="emit('toggle-more-servers')"
        @select-server="emit('select-server', $event)"
        @contextmenu="onServerContextMenu"
        @rail-pointer-down="onRailServerPointerDown"
        :horizontal="props.layout === 'horizontal'"
        :bug-hunter-enabled="props.bugHunterEnabled"
        @open-bug-report="emit('open-bug-report')"
      />
    </div>
    <ServerRailContextMenu
      :menu-open="menuOpen"
      :menu-ref="_menuRef"
      :menu-position="menuPosition"
      :context-server="contextServer"
      :dev-mode-ids-enabled="devModeIdsEnabled"
      :can-open-server-settings-for-server="canOpenServerSettingsForServer"
      :can-open-invite-for-server="canOpenInviteForServer"
      :can-leave-context-server="canLeaveContextServer()"
      @settings="emitRailAndClose(() => emit('server-rail-settings', $event))"
      @invite="emitRailAndClose(() => emit('server-rail-invite', $event))"
      @notification-settings="
        emitRailAndClose(() =>
          emit('server-rail-notification-settings', $event),
        )
      "
      @mark-read="emitRailAndClose(() => emit('server-rail-mark-read', $event))"
      @copy-id="copyServerIdFromRailMenu"
      @leave="emitRailAndClose(() => emit('server-rail-leave', $event))"
      @close="closeMenu"
    />
    <ServerRailLaneContextMenu
      :menu-open="laneMenuOpen && laneMenuScope !== null"
      :menu-ref="_laneMenuRef"
      :menu-position="laneMenuPosition"
      :title="laneMenuScope === 'dm' ? 'Direct messages' : 'Servers'"
      @mark-all-read="emitLaneMarkAllReadAndClose"
      @close="closeLaneContextMenu"
    />

    <RailProfileBar
      v-if="props.authenticated && props.currentUser"
      :current-user="props.currentUser"
      :mobile-surface="!!props.presenceMobileByUserId?.[props.currentUser.id]"
      :bug-hunter-enabled="props.bugHunterEnabled"
      :away-self-speaking="props.railProfileAwaySelfSpeaking ?? false"
      :horizontal-rail="props.layout === 'horizontal'"
      :profile-only="props.layout === 'horizontal'"
      @open-self-profile="openSelfProfile"
      @open-bug-report="emit('open-bug-report')"
    />
  </nav>
</template>

<style lang="scss">
$reactive-decay-ease: cubic-bezier(0.33, 1, 0.68, 1);

.server-item-wrapper {
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 5px;
    height: 4px;
    background-color: var(--server-rail-pill-fg);
    border-radius: 0 4px 4px 0;
    transform: translateY(-50%) scaleY(0);
    opacity: 0;
    transform-origin: center;
    transition: all 0.3s $reactive-decay-ease;
  }

  &:hover::before,
  &.server-item-wrapper--selected::before {
    opacity: 1;
    transform: translateY(-50%) scaleY(1);
    height: 28px;
  }
}

.explore-trigger__button {
  border-radius: 16px;
}

.explore-trigger__button--close {
  background: var(--vue-auto-004);
}

.explore-trigger__button--close:hover {
  background: var(--vue-auto-032);
}

.explore-trigger__button--idle {
  background: transparent;
}

.explore-trigger__button--active {
  background: var(--vue-auto-014);
}

.servers-folder {
  pointer-events: auto;
}

/** While reordering, let drop indicators sit in the gap between icons (not clipped). */
.servers-folder--rail-dnd {
  overflow: visible !important;
}

.server-folder__slot {
  position: relative;
}

/**
 * Drop indicators: use slot ::after (not a child div) so HTML5 drag never hits a
 * separate box on the line — even with pointer-events:none, extra nodes can still
 * disrupt drag in some browsers.
 */
.server-folder__slot--rail-drop-above::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 2;
  width: 2.25rem;
  height: 3px;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
  transform: translate(-50%, calc(-100% - 6px));
}

.server-folder__slot--rail-drop-below::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  z-index: 2;
  width: 2.25rem;
  height: 3px;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
  transform: translate(-50%, calc(100% + 6px));
}

.server-folder__slot--rail-drop-before-h::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  z-index: 2;
  width: 3px;
  height: 2.25rem;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
  transform: translate(calc(-100% - 6px), -50%);
}

.server-folder__slot--rail-drop-after-h::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  z-index: 2;
  width: 3px;
  height: 2.25rem;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
  transform: translate(calc(100% + 6px), -50%);
}

.server-folder__item--drag-source {
  background: transparent !important;
  border: 2px solid var(--vue-auto-012);
  box-shadow:
    0 0 0 1px var(--vue-auto-007),
    0 0 14px var(--vue-auto-089) !important;
}

.server-folder__item--drag-source :deep(img),
.server-folder__item--drag-source .server-folder__initials {
  opacity: 0;
  visibility: hidden;
}

.server-folder__item--drag-source:hover {
  transform: none !important;
}

.server-folder__slot--more {
  margin-bottom: 0.125rem;
}

.server-folder__item {
  background: var(--vue-auto-001);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-002),
    0 8px 18px var(--vue-auto-089);
}

.server-folder__item--idle:hover {
  transform: translateY(-1px);
  background: var(--vue-auto-014);
}

.server-folder__item--active {
  background: var(--vue-auto-050);
  box-shadow: 0 10px 22px var(--vue-auto-276);
}

.server-folder__item--more {
  background: var(--vue-auto-002);
}

.server-folder__item--more:hover {
  background: var(--vue-auto-014);
}

.more-servers-count {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  color: var(--vue-auto-012);
  font-variant-numeric: tabular-nums;
}

[data-theme='light'] .server-folder__item {
  box-shadow: none;
}

[data-theme='light'] .server-folder__item--active {
  box-shadow: none;
}

.server-folder__initials {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--server-rail-pill-fg);
}

.explore-trigger:hover img {
  opacity: 1;
}
</style>
