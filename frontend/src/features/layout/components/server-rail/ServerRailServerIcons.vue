<script setup lang="ts">
import { ref } from 'vue';
import type { Server } from '@shared/types';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import { icons } from '@/assets/icons';
import {
  type ServerPingChannelDotsForServerRail,
  type ServerPingKind,
  describeServerPingBubbleLine,
  describeServerPingChannelDotsSummary,
  describeServerPingKind,
} from '@/features/server-notifications/serverPing';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import {
  getServerNotifBadge,
  getServerNotifTitle,
  getServerNotifGlyph,
} from './serverRailNotifications';

const props = defineProps<{
  visibleServers: Server[];
  selectedServerId: string | null;
  areServersExpanded: boolean;
  reorderEnabled: boolean;
  railDragSourceIndex: number | null;
  railDropLineBefore: number | null;
  /** Viewport position for the floating drag ghost (pointer-driven rail reorder). */
  railGhostPosition: { x: number; y: number } | null;
  /** Server shown under the ghost while dragging. */
  railDragGhostServer: Server | null;
  /** When reorder is enabled, return false from click handler if the gesture was a drag. */
  beforeSelectServer?: () => boolean;
  showExtraServersRailButton: boolean;
  moreServersCount: number;
  selectedOverflowServer?: Server | null;
  serverNotificationLevels?: Record<string, ServerNotificationLevel>;
  /** Strongest unread mention class per server (personal / role / broadcast). */
  serverPingKinds?: Record<string, ServerPingKind>;
  /** Aggregated ping tier + count for colored badge. */
  serverPingBubbles?: Record<string, ServerPingBubbleDisplay>;
  /** Per-channel ping dots around the server icon. */
  serverPingChannelDots?: Record<string, ServerPingChannelDotsForServerRail>;
  /** Non-mention unread messages — compact activity indicator beside the rail pill. */
  serverUnreadActivityDot?: Record<string, true>;
  /** True when any voice channel in this server has active participants. */
  serverActiveVoiceByServerId?: Record<string, boolean>;
  unreadBadgeEnabled: boolean;
  /** Top horizontal action strip — scroll server icons on X. */
  horizontal?: boolean;
}>();

function pingBubbleStyle(kind: ServerPingKind): Record<string, string> {
  const key =
    kind === 'personal'
      ? '--server-ping-personal'
      : kind === 'role'
        ? '--server-ping-role'
        : '--server-ping-broadcast';
  return { backgroundColor: `var(${key})` };
}

function pingDotRingStyle(
  index: number,
  total: number,
  kind: ServerPingKind,
): Record<string, string> {
  const step = total > 0 ? 360 / total : 0;
  const deg = step * index;
  const radial =
    (props.horizontal ?? false)
      ? `rotate(${deg}deg) translateX(21px)`
      : `rotate(${deg}deg) translateY(-21px)`;
  return {
    ...pingBubbleStyle(kind),
    transform: radial,
  };
}

function serverIconTitle(server: Server, reorder: boolean): string {
  const hasActiveVoice = !!props.serverActiveVoiceByServerId?.[server.id];
  const voiceLine = hasActiveVoice ? 'Active voice channel' : '';
  const dotPack = props.serverPingChannelDots?.[server.id];
  const bubble = props.serverPingBubbles?.[server.id];
  const pingLine = dotPack?.dots?.length
    ? describeServerPingChannelDotsSummary(dotPack.dots, dotPack.overflowCount)
    : bubble
      ? describeServerPingBubbleLine(bubble.kind, bubble.count)
      : props.serverPingKinds?.[server.id]
        ? describeServerPingKind(props.serverPingKinds[server.id]!)
        : '';
  const notifBadge = getServerNotifBadge(
    server.id,
    props.serverNotificationLevels,
  );
  const notifLine = notifBadge
    ? getServerNotifTitle(server.id, props.serverNotificationLevels)
    : '';
  const plainUnreadLine =
    props.unreadBadgeEnabled && props.serverUnreadActivityDot?.[server.id]
      ? 'Unread messages'
      : '';
  if (reorder) {
    const statusBits = [
      voiceLine,
      pingLine || notifLine || plainUnreadLine,
    ].filter(Boolean);
    const base = statusBits.length
      ? `${server.name} — ${statusBits.join('. ')}. `
      : `${server.name}. `;
    return `${base}Hold and drag to reorder.`;
  }
  if (voiceLine && pingLine)
    return `${server.name} — ${voiceLine}. ${pingLine}`;
  if (voiceLine && notifLine)
    return `${server.name} — ${voiceLine}. ${notifLine}`;
  if (voiceLine && plainUnreadLine)
    return `${server.name} — ${voiceLine}. ${plainUnreadLine}`;
  if (voiceLine) return `${server.name} — ${voiceLine}`;
  if (pingLine) return `${server.name} — ${pingLine}`;
  if (notifLine) return `${server.name} — ${notifLine}`;
  if (plainUnreadLine) return `${server.name} — ${plainUnreadLine}`;
  return server.name;
}

const emit = defineEmits<{
  'select-server': [serverId: string];
  contextmenu: [server: Server, event: MouseEvent];
  'rail-pointer-down': [
    payload: { event: PointerEvent; index: number; folderRoot: HTMLElement },
  ];
  'toggle-more-servers': [];
}>();

const folderRootRef = ref<HTMLElement | null>(null);

function onRailPointerDown(e: PointerEvent, index: number) {
  const root = folderRootRef.value;
  if (!root) return;
  emit('rail-pointer-down', { event: e, index, folderRoot: root });
}

function onServerIconClick(serverId: string) {
  if (props.beforeSelectServer && !props.beforeSelectServer()) return;
  emit('select-server', serverId);
}

function onMoreServersContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  const overflowServer = props.selectedOverflowServer ?? null;
  if (overflowServer) {
    emit('contextmenu', overflowServer, event);
    return;
  }
  emit('toggle-more-servers');
}

/** Center-out stagger so motion reads as vertical rise, not a left→right sweep. */
function horizontalPillStaggerMs(index: number, total: number): string {
  if (total <= 1) return '0ms';
  const mid = (total - 1) / 2;
  const ring = Math.abs(index - mid);
  const ms = Math.min(ring, 22) * 36;
  return `${Math.round(ms)}ms`;
}
</script>

<template>
  <div
    ref="folderRootRef"
    data-cy="server-rail-reorder-root"
    class="servers-folder custom-scrollbar flex items-center transition-all duration-300 ease-out"
    :class="[
      horizontal
        ? 'servers-folder--horizontal mt-0 min-h-10 w-auto min-w-0 flex-row flex-nowrap items-center overflow-x-auto overflow-y-visible opacity-100'
        : 'w-full flex-col',
      !horizontal && areServersExpanded
        ? 'mt-2 max-h-[min(70vh,28rem)] overflow-y-auto opacity-100'
        : '',
      !horizontal && !areServersExpanded
        ? 'max-h-0 overflow-hidden opacity-0'
        : '',
      railDragSourceIndex !== null ? 'servers-folder--rail-dnd' : '',
    ]"
  >
    <div
      v-for="(server, serverIndex) in visibleServers"
      :key="server.id"
      class="server-folder__slot flex justify-center overflow-visible"
      :class="[
        horizontal ? 'mr-2 w-auto shrink-0 last:mr-0' : 'mb-2 w-full',
        server.id === selectedServerId ? 'server-folder__slot--active' : '',
        unreadBadgeEnabled &&
        serverUnreadActivityDot?.[server.id] &&
        server.id !== selectedServerId
          ? horizontal
            ? 'server-folder__slot--unread-activity-h'
            : 'server-folder__slot--unread-activity'
          : '',
        railDragSourceIndex !== null ? 'server-folder__slot--rail-dnd' : '',
        railDragSourceIndex !== null && railDropLineBefore === serverIndex
          ? horizontal
            ? 'server-folder__slot--rail-drop-before-h'
            : 'server-folder__slot--rail-drop-above'
          : '',
        railDragSourceIndex !== null &&
        railDropLineBefore === visibleServers.length &&
        serverIndex === visibleServers.length - 1 &&
        !showExtraServersRailButton
          ? horizontal
            ? 'server-folder__slot--rail-drop-after-h'
            : 'server-folder__slot--rail-drop-below'
          : '',
      ]"
    >
      <span
        v-if="
          railDragSourceIndex !== serverIndex &&
          unreadBadgeEnabled &&
          serverUnreadActivityDot?.[server.id] &&
          server.id !== selectedServerId
        "
        class="server-folder__unread-activity-dot pointer-events-none absolute z-[3]"
        :class="[
          horizontal
            ? 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 server-folder__unread-activity-dot--horizontal'
            : 'left-0 top-1/2 -translate-y-1/2',
        ]"
        aria-hidden="true"
      />
      <button
        type="button"
        data-cy="server-rail-icon"
        class="server-folder__item relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full transition-all"
        :class="[
          server.id === selectedServerId
            ? 'server-folder__item--active'
            : 'server-folder__item--idle',
          reorderEnabled
            ? 'cursor-grab select-none touch-none active:cursor-grabbing'
            : '',
          railDragSourceIndex === serverIndex
            ? 'server-folder__item--drag-source'
            : '',
          horizontal ? 'server-folder__item--enter-h' : '',
        ]"
        :style="
          horizontal
            ? {
                animationDelay: horizontalPillStaggerMs(
                  serverIndex,
                  visibleServers.length + (showExtraServersRailButton ? 1 : 0),
                ),
              }
            : undefined
        "
        :title="serverIconTitle(server, reorderEnabled)"
        @pointerdown="onRailPointerDown($event, serverIndex)"
        @click="onServerIconClick(server.id)"
        @contextmenu.stop.prevent="emit('contextmenu', server, $event)"
      >
        <span
          class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
          aria-hidden="true"
        >
          <PausedGifAvatar
            :src="serverGuildIconDisplayUrl(server.imageUrl)"
            :alt="server.name"
            img-class="h-full w-full rounded-full object-cover"
          />
        </span>
        <span
          v-if="
            railDragSourceIndex !== serverIndex &&
            unreadBadgeEnabled &&
            serverPingChannelDots?.[server.id]?.dots?.length
          "
          class="pointer-events-none absolute inset-0 z-[2]"
          aria-hidden="true"
        >
          <span
            v-for="(dot, dotIndex) in serverPingChannelDots?.[server.id]
              ?.dots ?? []"
            :key="dot.channelId"
            class="absolute left-1/2 top-1/2 h-2 w-2 -ml-1 -mt-1 rounded-full border-2 border-[var(--bg)] shadow-sm"
            :style="
              pingDotRingStyle(
                dotIndex,
                serverPingChannelDots?.[server.id]?.dots?.length ?? 0,
                dot.kind,
              )
            "
          />
        </span>
        <span
          v-if="
            railDragSourceIndex !== serverIndex &&
            serverActiveVoiceByServerId?.[server.id]
          "
          class="server-folder__voice-badge pointer-events-none absolute -bottom-0.5 -left-0.5 z-[1] inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-[var(--bg)] shadow-sm"
          aria-hidden="true"
        >
          <img
            :src="icons.volumeUp"
            alt=""
            class="h-2.5 w-2.5 brightness-0 invert opacity-95"
          />
        </span>
        <span
          v-if="
            railDragSourceIndex !== serverIndex &&
            unreadBadgeEnabled &&
            serverPingBubbles?.[server.id] &&
            !serverPingChannelDots?.[server.id]?.dots?.length
          "
          class="pointer-events-none absolute z-[1] flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--bg)] px-0.5 text-[10px] font-bold tabular-nums leading-none text-white shadow-sm"
          :class="horizontal ? '-right-0.5 -top-0.5' : '-left-0.5 -top-0.5'"
          :style="pingBubbleStyle(serverPingBubbles[server.id]!.kind)"
          aria-hidden="true"
        >
          {{ serverPingBubbles[server.id]!.count }}
        </span>
        <span
          v-if="
            railDragSourceIndex !== serverIndex &&
            unreadBadgeEnabled &&
            getServerNotifBadge(server.id, serverNotificationLevels)
          "
          class="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border border-[var(--bg)] px-0.5 text-[9px] font-bold leading-none shadow-sm"
          :class="{
            'bg-[var(--accent)] text-[var(--accent-contrast-fg)]':
              getServerNotifBadge(server.id, serverNotificationLevels) ===
              'mentions_direct',
            'bg-elevated text-foreground':
              getServerNotifBadge(server.id, serverNotificationLevels) ===
              'none',
          }"
          aria-hidden="true"
        >
          {{
            getServerNotifGlyph(
              getServerNotifBadge(server.id, serverNotificationLevels)!,
            )
          }}
        </span>
      </button>
    </div>
    <div
      v-if="showExtraServersRailButton"
      class="server-folder__slot server-folder__slot--more flex justify-center"
      :class="[
        horizontal ? 'w-auto shrink-0' : 'w-full',
        railDragSourceIndex !== null ? 'server-folder__slot--rail-dnd' : '',
        railDragSourceIndex !== null &&
        railDropLineBefore === visibleServers.length
          ? horizontal
            ? 'server-folder__slot--rail-drop-before-h'
            : 'server-folder__slot--rail-drop-above'
          : '',
      ]"
    >
      <button
        type="button"
        class="server-folder__item server-folder__item--more flex h-10 w-10 items-center justify-center rounded-full transition-all"
        :class="horizontal ? 'server-folder__item--enter-h' : ''"
        :style="
          horizontal
            ? {
                animationDelay: horizontalPillStaggerMs(
                  visibleServers.length,
                  visibleServers.length + (showExtraServersRailButton ? 1 : 0),
                ),
              }
            : undefined
        "
        :title="`${moreServersCount} more servers`"
        @click="emit('toggle-more-servers')"
        @contextmenu="onMoreServersContextMenu"
      >
        <span class="more-servers-count">{{ moreServersCount }}</span>
      </button>
      <button
        v-if="horizontal && selectedOverflowServer"
        type="button"
        class="server-folder__overflow-pill ml-2 inline-flex max-w-[12rem] shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
        :title="`Current server: ${selectedOverflowServer.name}`"
        @click="emit('toggle-more-servers')"
        @contextmenu="onMoreServersContextMenu"
      >
        <span class="truncate">{{ selectedOverflowServer.name }}</span>
      </button>
    </div>
    <Teleport to="body">
      <div
        v-if="
          reorderEnabled &&
          railDragSourceIndex !== null &&
          railDragGhostServer &&
          railGhostPosition
        "
        class="pointer-events-none fixed z-[9999] h-10 w-10 rounded-full border-2 border-[var(--vue-auto-012)] bg-[var(--vue-auto-001)] shadow-[0_0_14px_var(--vue-auto-089)]"
        :style="{
          left: `${railGhostPosition.x - 20}px`,
          top: `${railGhostPosition.y - 20}px`,
        }"
        aria-hidden="true"
      >
        <span
          class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-full"
        >
          <PausedGifAvatar
            :src="serverGuildIconDisplayUrl(railDragGhostServer.imageUrl)"
            :alt="railDragGhostServer.name"
            img-class="h-full w-full rounded-full object-cover"
          />
        </span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.server-folder__voice-badge {
  background: var(--server-vc-active, #22c55e);
}

/* Plain-unread sliver beside the selection pill — theme-aware (not hardcoded white). */
.server-folder__unread-activity-dot {
  width: 4px;
  height: 10px;
  border-radius: 0 4px 4px 0;
  background: var(--server-rail-unread-activity-bg);
  box-shadow: 0 0 8px var(--server-rail-unread-activity-shadow);
}

.server-folder__slot--unread-activity:hover .server-folder__unread-activity-dot,
.server-folder__slot--unread-activity-h:hover
  .server-folder__unread-activity-dot {
  opacity: 0;
}

.server-folder__unread-activity-dot--horizontal {
  width: 12px;
  height: 4px;
  border-radius: 9999px;
}

[data-theme='light'] .server-folder__voice-badge img {
  filter: none !important;
  opacity: 0.92;
}

/* Top horizontal action rail: icons drop in from above so motion fits the top bar (window edge).
   Left sidebar still uses the default vertical rail stagger elsewhere — this class is horizontal-only. */
.server-folder__item--enter-h {
  transform-origin: center top;
  animation: server-pill-enter-top 0.48s cubic-bezier(0.16, 1, 0.35, 1)
    backwards;
}

.server-folder__overflow-pill {
  border: 1px solid var(--srv-server-pill-ring);
  background: var(--srv-server-pill-bg);
  color: var(--srv-server-pill-fg);
  box-shadow:
    inset 0 0 0 1px var(--srv-server-pill-ring),
    0 4px 10px color-mix(in srgb, var(--text) 14%, transparent);
}

.server-folder__overflow-pill:hover {
  background: color-mix(
    in srgb,
    var(--srv-server-pill-bg) 70%,
    var(--elevated) 30%
  );
}

@keyframes server-pill-enter-top {
  from {
    opacity: 0;
    transform: translate3d(0, -14px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
</style>
