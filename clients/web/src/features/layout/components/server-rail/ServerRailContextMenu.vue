<script setup lang="ts">
import type { Server } from '@shared/types';
import { icons } from '@/assets/icons';
import { ECHO_SIMPLE_CONTEXT_MENU_ATTR } from '@/features/layout/useSimpleContextMenu';

defineProps<{
  menuOpen: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarded to a child :ref binding; a parent ref unwraps to its element here
  menuRef?: any;
  menuPosition: { left: number; top: number };
  contextServer: Server | null;
  devModeIdsEnabled: boolean;
  canOpenServerSettingsForServer?: (serverId: string) => boolean;
  /** When set, “Invite people” only shows when this returns true for the guild id. */
  canOpenInviteForServer?: (serverId: string) => boolean;
  canLeaveContextServer: boolean;
}>();

const emit = defineEmits<{
  settings: [serverId: string];
  invite: [serverId: string];
  'notification-settings': [serverId: string];
  'mark-read': [serverId: string];
  'copy-id': [];
  leave: [serverId: string];
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menuOpen && contextServer"
      :ref="menuRef"
      v-bind="{ [ECHO_SIMPLE_CONTEXT_MENU_ATTR]: '' }"
      class="ellipsis-menu fixed z-[120] min-w-[220px] py-1"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
      role="menu"
      aria-label="Server options"
      @mousedown.stop
      @contextmenu.prevent
    >
      <div
        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle truncate border-b border-border"
      >
        {{ contextServer.name }}
      </div>
      <button
        v-if="
          !canOpenServerSettingsForServer ||
          canOpenServerSettingsForServer(contextServer.id)
        "
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="emit('settings', contextServer.id)"
      >
        <img
          :src="icons.settings"
          alt=""
          class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
        />
        Server settings
      </button>
      <button
        v-if="
          canOpenInviteForServer &&
          contextServer &&
          canOpenInviteForServer(contextServer.id)
        "
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="emit('invite', contextServer.id)"
      >
        <img
          :src="icons.friendAdd"
          alt=""
          class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
        />
        Invite people
      </button>
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="emit('notification-settings', contextServer.id)"
      >
        <img
          :src="icons.bellSchool"
          alt=""
          class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
        />
        Notification settings
      </button>
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="emit('mark-read', contextServer.id)"
      >
        <img
          :src="icons.friendAdded"
          alt=""
          class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
        />
        Mark as read
      </button>
      <button
        v-if="devModeIdsEnabled"
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="emit('copy-id')"
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
        Copy server ID
      </button>
      <template v-if="canLeaveContextServer">
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <button
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('leave', contextServer.id)"
        >
          <img
            :src="icons.logOut"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Leave server
        </button>
      </template>
    </div>
  </Teleport>
</template>
