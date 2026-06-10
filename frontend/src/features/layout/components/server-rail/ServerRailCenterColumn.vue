<script setup lang="ts">
import { icons } from '@/assets/icons';
import DmIncomingRailCluster from './DmIncomingRailCluster.vue';
import ServerRailServerIcons from './ServerRailServerIcons.vue';
import type { Server } from '@shared/types';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import type {
  ServerPingChannelDotsForServerRail,
  ServerPingKind,
} from '@/features/server-notifications/serverPing';

const props = defineProps<{
  authenticated: boolean;
  activeRailTab?: 'servers' | 'explore' | 'dm';
  showDmIncomingRailCluster: boolean;
  dmIncomingRailAvatars: Array<
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
  dmIncomingRailOverflow: number;
  dmIncomingRailTotalUnread: number;
  visibleServers: Server[];
  selectedServerId: string | null;
  areServersExpanded: boolean;
  reorderEnabled: boolean;
  railDragSourceIndex: number | null;
  railDropLineBefore: number | null;
  railGhostPosition: { x: number; y: number } | null;
  railDragGhostServer: Server | null;
  beforeSelectServer?: () => boolean;
  showExtraServersRailButton: boolean;
  moreServersCount: number;
  selectedOverflowServer?: Server | null;
  serverNotificationLevels?: Record<string, ServerNotificationLevel>;
  serverPingKinds?: Record<string, ServerPingKind>;
  serverPingBubbles?: Record<string, ServerPingBubbleDisplay>;
  serverPingChannelDots?: Record<string, ServerPingChannelDotsForServerRail>;
  /** Sparse map: server ids with plain-message unread (compact rail indicator). */
  serverUnreadActivityDot?: Record<string, true>;
  serverActiveVoiceByServerId?: Record<string, boolean>;
  unreadBadgeEnabled: boolean;
  isMockDataMode: boolean;
  showChannelButton?: boolean;
  showMemberButton?: boolean;
  showDmListButton?: boolean;
  /** Top horizontal action strip layout. */
  horizontal?: boolean;
  /** Bug Hunter control — shown in the centered cluster when horizontal (trailing edge is profile-only). */
  bugHunterEnabled?: boolean;
}>();

const emit = defineEmits<{
  'toggle-dm-panel': [];
  'select-incoming-dm': [userId: string];
  'select-incoming-group-dm': [channelId: string];
  'open-dm-inbox-overflow': [];
  'open-servers-rail': [];
  'toggle-explore': [];
  'open-auth': [];
  'expand-channels': [];
  'expand-members': [];
  'toggle-more-servers': [];
  'select-server': [serverId: string];
  contextmenu: [server: Server, event: MouseEvent];
  'rail-pointer-down': [
    payload: { event: PointerEvent; index: number; folderRoot: HTMLElement },
  ];
  'open-bug-report': [];
  'servers-lane-contextmenu': [event: MouseEvent];
  'dm-lane-contextmenu': [event: MouseEvent];
}>();
</script>

<template>
  <div
    class="pointer-events-none"
    :class="
      props.horizontal
        ? 'relative flex min-h-0 w-full max-w-full flex-row items-center justify-center overflow-x-hidden overflow-y-visible'
        : 'absolute inset-0 flex items-center justify-center overflow-x-hidden'
    "
  >
    <div
      class="pointer-events-auto"
      :class="
        props.horizontal
          ? 'flex min-h-0 w-auto max-w-full min-w-0 flex-row flex-nowrap items-center justify-center gap-2 overflow-x-auto overflow-y-visible px-3 pb-2 pt-3 md:px-6'
          : 'flex w-full flex-col items-center justify-center gap-2 server-rail-center-column--vertical'
      "
    >
      <template v-if="authenticated && props.horizontal">
        <div
          class="flex shrink-0 flex-row items-center gap-2"
          :class="
            dmIncomingRailTotalUnread > 0
              ? 'dm-rail-lane dm-rail-lane--horizontal'
              : ''
          "
        >
          <button
            type="button"
            class="explore-trigger relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
            title="Direct messages"
            @click="emit('toggle-dm-panel')"
            @contextmenu.stop.prevent="emit('dm-lane-contextmenu', $event)"
          >
            <div
              class="explore-trigger__button flex h-10 w-10 items-center justify-center transition-colors duration-200"
              :class="
                activeRailTab === 'dm'
                  ? 'explore-trigger__button--active'
                  : dmIncomingRailTotalUnread > 0
                    ? 'explore-trigger__button--dm-flat'
                    : 'explore-trigger__button--idle'
              "
            >
              <img
                :src="
                  activeRailTab === 'dm' ? icons.messageFilled : icons.message
                "
                alt="Direct messages"
                class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
              />
            </div>
          </button>
          <DmIncomingRailCluster
            v-if="showDmIncomingRailCluster"
            :avatars="dmIncomingRailAvatars"
            :overflow-count="dmIncomingRailOverflow"
            layout="horizontal"
            @select-incoming-dm="emit('select-incoming-dm', $event)"
            @select-incoming-group-dm="emit('select-incoming-group-dm', $event)"
            @open-dm-inbox-overflow="emit('open-dm-inbox-overflow')"
          />
        </div>
        <div
          class="flex min-h-0 min-w-0 flex-row items-center [scrollbar-width:thin]"
          :class="
            areServersExpanded
              ? 'max-w-[min(760px,58vw)] gap-2 overflow-x-auto overflow-y-visible'
              : 'w-fit max-w-none shrink-0 overflow-hidden'
          "
        >
          <button
            type="button"
            class="explore-trigger relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
            title="Servers"
            @click="emit('open-servers-rail')"
            @contextmenu.stop.prevent="emit('servers-lane-contextmenu', $event)"
          >
            <div
              class="explore-trigger__button flex h-10 w-10 items-center justify-center transition-colors duration-200"
              :class="
                activeRailTab === 'servers'
                  ? 'explore-trigger__button--active'
                  : 'explore-trigger__button--idle'
              "
            >
              <img
                :src="
                  activeRailTab === 'servers'
                    ? icons.communityFilled
                    : icons.community
                "
                alt="Servers"
                class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
              />
            </div>
          </button>
          <ServerRailServerIcons
            horizontal
            :visible-servers="visibleServers"
            :selected-server-id="selectedServerId"
            :are-servers-expanded="areServersExpanded"
            :reorder-enabled="reorderEnabled"
            :rail-drag-source-index="railDragSourceIndex"
            :rail-drop-line-before="railDropLineBefore"
            :rail-ghost-position="railGhostPosition"
            :rail-drag-ghost-server="railDragGhostServer"
            :before-select-server="beforeSelectServer"
            :show-extra-servers-rail-button="showExtraServersRailButton"
            :more-servers-count="moreServersCount"
            :selected-overflow-server="selectedOverflowServer ?? null"
            :server-notification-levels="serverNotificationLevels"
            :server-ping-kinds="serverPingKinds"
            :server-ping-bubbles="serverPingBubbles"
            :server-ping-channel-dots="serverPingChannelDots"
            :server-unread-activity-dot="serverUnreadActivityDot"
            :server-active-voice-by-server-id="serverActiveVoiceByServerId"
            :unread-badge-enabled="unreadBadgeEnabled"
            @select-server="emit('select-server', $event)"
            @contextmenu="(server, ev) => emit('contextmenu', server, ev)"
            @rail-pointer-down="(payload) => emit('rail-pointer-down', payload)"
            @toggle-more-servers="emit('toggle-more-servers')"
          />
        </div>
        <div class="flex shrink-0 items-center justify-center">
          <button
            type="button"
            class="explore-trigger relative flex h-10 w-10 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
            title="Explore servers"
            @click="emit('toggle-explore')"
          >
            <div
              class="explore-trigger__button flex h-10 w-10 items-center justify-center transition-colors duration-200"
              :class="
                activeRailTab === 'explore'
                  ? 'explore-trigger__button--active'
                  : 'explore-trigger__button--idle'
              "
            >
              <img
                :src="icons.exploreFilled"
                alt="Explore servers"
                class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
              />
            </div>
          </button>
        </div>
        <button
          v-if="props.bugHunterEnabled"
          type="button"
          class="rail-bug-hunter shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/15 text-amber-200 shadow-md transition hover:bg-amber-500/25 hover:brightness-110"
          title="Report a bug"
          aria-label="Report a bug"
          @click="emit('open-bug-report')"
        >
          <span class="text-[13px] leading-none" aria-hidden="true">🐛</span>
        </button>
      </template>
      <template v-else-if="authenticated">
        <div
          class="w-full"
          :class="dmIncomingRailTotalUnread > 0 ? 'dm-rail-lane' : ''"
        >
          <button
            type="button"
            class="explore-trigger relative flex h-12 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
            title="Direct messages"
            @click="emit('toggle-dm-panel')"
            @contextmenu.stop.prevent="emit('dm-lane-contextmenu', $event)"
          >
            <div
              class="explore-trigger__button flex h-12 w-12 items-center justify-center transition-colors duration-200"
              :class="
                activeRailTab === 'dm'
                  ? 'explore-trigger__button--active'
                  : dmIncomingRailTotalUnread > 0
                    ? 'explore-trigger__button--dm-flat'
                    : 'explore-trigger__button--idle'
              "
            >
              <img
                :src="
                  activeRailTab === 'dm' ? icons.messageFilled : icons.message
                "
                alt="Direct messages"
                class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
              />
            </div>
          </button>
          <DmIncomingRailCluster
            v-if="showDmIncomingRailCluster"
            :avatars="dmIncomingRailAvatars"
            :overflow-count="dmIncomingRailOverflow"
            @select-incoming-dm="emit('select-incoming-dm', $event)"
            @select-incoming-group-dm="emit('select-incoming-group-dm', $event)"
            @open-dm-inbox-overflow="emit('open-dm-inbox-overflow')"
          />
        </div>
        <div class="flex w-full flex-col items-center">
          <button
            type="button"
            class="explore-trigger relative flex h-12 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
            title="Servers"
            @click="emit('open-servers-rail')"
            @contextmenu.stop.prevent="emit('servers-lane-contextmenu', $event)"
          >
            <div
              class="explore-trigger__button flex h-12 w-12 items-center justify-center transition-colors duration-200"
              :class="
                activeRailTab === 'servers'
                  ? 'explore-trigger__button--active'
                  : 'explore-trigger__button--idle'
              "
            >
              <img
                :src="
                  activeRailTab === 'servers'
                    ? icons.communityFilled
                    : icons.community
                "
                alt="Servers"
                class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
              />
            </div>
          </button>
          <ServerRailServerIcons
            :visible-servers="visibleServers"
            :selected-server-id="selectedServerId"
            :are-servers-expanded="areServersExpanded"
            :reorder-enabled="reorderEnabled"
            :rail-drag-source-index="railDragSourceIndex"
            :rail-drop-line-before="railDropLineBefore"
            :rail-ghost-position="railGhostPosition"
            :rail-drag-ghost-server="railDragGhostServer"
            :before-select-server="beforeSelectServer"
            :show-extra-servers-rail-button="showExtraServersRailButton"
            :more-servers-count="moreServersCount"
            :selected-overflow-server="selectedOverflowServer ?? null"
            :server-notification-levels="serverNotificationLevels"
            :server-ping-kinds="serverPingKinds"
            :server-ping-bubbles="serverPingBubbles"
            :server-ping-channel-dots="serverPingChannelDots"
            :server-unread-activity-dot="serverUnreadActivityDot"
            :server-active-voice-by-server-id="serverActiveVoiceByServerId"
            :unread-badge-enabled="unreadBadgeEnabled"
            @select-server="emit('select-server', $event)"
            @contextmenu="(server, ev) => emit('contextmenu', server, ev)"
            @rail-pointer-down="(payload) => emit('rail-pointer-down', payload)"
            @toggle-more-servers="emit('toggle-more-servers')"
          />
        </div>
        <div class="mt-0 flex w-full items-center justify-center">
          <button
            type="button"
            class="explore-trigger relative flex h-12 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
            title="Explore servers"
            @click="emit('toggle-explore')"
          >
            <div
              class="explore-trigger__button flex h-12 w-12 items-center justify-center transition-colors duration-200"
              :class="
                activeRailTab === 'explore'
                  ? 'explore-trigger__button--active'
                  : 'explore-trigger__button--idle'
              "
            >
              <img
                :src="icons.exploreFilled"
                alt="Explore servers"
                class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
              />
            </div>
          </button>
        </div>
      </template>
      <div
        v-else
        class="mt-0 flex items-center justify-center gap-2"
        :class="props.horizontal ? 'min-w-0 flex-row' : 'w-full flex-col'"
      >
        <button
          type="button"
          class="explore-trigger relative flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
          :class="props.horizontal ? 'h-10 w-10 shrink-0' : 'h-12 w-full'"
          title="Log in or register"
          @click="emit('open-auth')"
        >
          <div
            class="explore-trigger__button explore-trigger__button--active flex items-center justify-center transition-colors duration-200"
            :class="props.horizontal ? 'h-10 w-10' : 'h-12 w-12'"
          >
            <img
              :src="icons.logIn"
              alt="Log in"
              class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
            />
          </div>
        </button>
        <button
          type="button"
          class="explore-trigger relative flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
          :class="props.horizontal ? 'h-10 w-10 shrink-0' : 'h-12 w-full'"
          title="Explore public servers"
          @click="emit('toggle-explore')"
        >
          <div
            class="explore-trigger__button flex items-center justify-center transition-colors duration-200"
            :class="[
              props.horizontal ? 'h-10 w-10' : 'h-12 w-12',
              activeRailTab === 'explore'
                ? 'explore-trigger__button--active'
                : 'explore-trigger__button--idle',
            ]"
          >
            <img
              :src="icons.exploreFilled"
              alt="Explore servers"
              class="rail-icon h-5 w-5 filter invert opacity-85 transition-opacity duration-200"
            />
          </div>
        </button>
        <button
          v-if="!isMockDataMode"
          type="button"
          class="max-w-[4.5rem] rounded-md px-1 py-0.5 text-center text-[9px] font-medium leading-tight text-fg-subtle transition-colors hover:bg-glass-hover hover:text-fg-soft"
          title="Continue"
          @click="emit('open-auth')"
        >
          Sign in
        </button>
      </div>
      <div
        v-if="authenticated && showDmListButton && !props.horizontal"
        class="mt-2 flex w-full flex-col items-center gap-1"
      >
        <button
          v-if="showDmListButton"
          type="button"
          class="explore-trigger relative flex h-10 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-inherit"
          title="Show direct messages"
          @click="emit('toggle-dm-panel')"
        >
          <div
            class="explore-trigger__button flex h-10 w-10 items-center justify-center transition-colors duration-200 explore-trigger__button--close"
          >
            <img
              :src="icons.messageAlt"
              alt="Direct messages"
              class="rail-icon h-4 w-4 filter invert opacity-90"
            />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 799px) {
  .server-rail-center-column--vertical {
    gap: 0.375rem;
  }
}

.explore-trigger__button--dm-flat {
  background: transparent;
  box-shadow: none;
}

.dm-rail-lane {
  width: 3rem;
  margin-left: auto;
  margin-right: auto;
  border-radius: 1rem;
  padding-top: 0.12rem;
  padding-bottom: 0.12rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, white 6%, transparent) 0%,
    color-mix(in srgb, white 3.5%, transparent) 100%
  );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 7%, transparent),
    0 8px 20px color-mix(in srgb, black 22%, transparent);
}

.dm-rail-lane--horizontal {
  width: auto;
  max-width: min(42vw, 18rem);
  margin-left: 0;
  margin-right: 0;
  border-radius: 0.75rem;
  padding: 0.12rem 0.35rem;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, white 6%, transparent) 0%,
    color-mix(in srgb, white 3.5%, transparent) 100%
  );
}

[data-theme='light'] .dm-rail-lane,
[data-theme='light'] .dm-rail-lane--horizontal {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--text) 5%, transparent) 0%,
    color-mix(in srgb, var(--text) 3%, transparent) 100%
  );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent),
    0 4px 12px color-mix(in srgb, var(--text) 8%, transparent);
}
</style>
