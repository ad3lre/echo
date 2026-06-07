<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { icons } from '@/assets/icons';
import iconFolder from '@/assets/icons/folder.svg?url';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import type { WidgetFolderContextMenu } from '@/composables/useMoreServersMenus';

const menuItemIconClass =
  'echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert';

defineProps<{
  openMenuId: string | null;
  openMenuServer: MoreServersMockServer | null;
  cardMenuPosition: { left: number; top: number } | null;
  cardMenuStyle: CSSProperties;
  contextMenu: WidgetFolderContextMenu | null;
  contextMenuStyle: CSSProperties;
  folders: MoreServerWidgetFolder[];
  contextMenuFolderName: string;
  contextMenuFolderExpandedLabel: string;
  canOpenInviteForServer?: (serverId: string) => boolean;
  isPinned: (id: string) => boolean;
  folderForServer: (serverId: string) => MoreServerWidgetFolder | null;
  openServerInfo: (id: string) => void;
  inviteServer: (id: string) => void;
  togglePin: (server: MoreServersMockServer) => void;
  assignServerToFolder: (serverId: string, folderId: string | null) => void;
  newFolderWithServer: (serverId: string) => void;
  onLeaveServer: (serverId: string) => void;
  contextMenuToggleFolderLayout: () => void;
  contextMenuEditFolder: () => void;
  openCreateFolderModal: () => void;
  contextMenuDeleteFolder: () => void;
  assignServerToFolderFromMenu: (folderId: string | null) => void;
  newFolderFromContextMenu: () => void;
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="openMenuId && openMenuServer && cardMenuPosition"
      data-more-servers-card-menu
      class="ellipsis-menu fixed z-[200] min-w-[200px] py-1"
      :style="cardMenuStyle"
      role="menu"
      aria-label="Server options"
      @mousedown.stop
    >
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="openServerInfo(openMenuServer.id)"
      >
        <img :src="icons.community" alt="" :class="menuItemIconClass" />
        View server info
      </button>
      <button
        v-if="canOpenInviteForServer?.(openMenuServer.id) ?? false"
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="inviteServer(openMenuServer.id)"
      >
        <img :src="icons.friendAdd" alt="" :class="menuItemIconClass" />
        Invite people
      </button>
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="togglePin(openMenuServer)"
      >
        <img :src="icons.thumbtack" alt="" :class="menuItemIconClass" />
        {{ isPinned(openMenuServer.id) ? 'Remove from rail' : 'Pin to rail' }}
      </button>
      <div class="my-1 h-px bg-glass-2" role="separator" />
      <div
        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle"
      >
        Widget folder
      </div>
      <button
        v-if="folderForServer(openMenuServer.id)"
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="assignServerToFolder(openMenuServer.id, null)"
      >
        <img :src="icons.arrowLeft" alt="" :class="menuItemIconClass" />
        Remove from folder
      </button>
      <button
        v-for="f in folders"
        :key="'card-fm-' + f.id"
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="assignServerToFolder(openMenuServer.id, f.id)"
      >
        <img :src="iconFolder" alt="" :class="menuItemIconClass" />
        Move to “{{ f.name }}”
      </button>
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="newFolderWithServer(openMenuServer.id)"
      >
        <img :src="icons.plus" alt="" :class="menuItemIconClass" />
        New folder with this server…
      </button>
      <div class="my-1 h-px bg-glass-2" role="separator" />
      <button
        type="button"
        class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="onLeaveServer(openMenuServer.id)"
      >
        <img :src="icons.logOut" alt="" :class="menuItemIconClass" />
        Leave server
      </button>
    </div>
    <div
      v-if="contextMenu"
      data-more-servers-folder-menu
      class="ellipsis-menu fixed z-[200] min-w-[200px] py-1"
      :style="contextMenuStyle"
      role="menu"
      @mousedown.stop
    >
      <template v-if="contextMenu.target === 'folder'">
        <div
          class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle truncate border-b border-border"
        >
          {{ contextMenuFolderName }}
        </div>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="contextMenuToggleFolderLayout"
        >
          <img :src="icons.list" alt="" :class="menuItemIconClass" />
          {{ contextMenuFolderExpandedLabel }}
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="contextMenuEditFolder"
        >
          <img :src="icons.pen" alt="" :class="menuItemIconClass" />
          Edit folder…
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="openCreateFolderModal"
        >
          <img :src="icons.plus" alt="" :class="menuItemIconClass" />
          New folder…
        </button>
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <button
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="contextMenuDeleteFolder"
        >
          <img :src="icons.trash" alt="" :class="menuItemIconClass" />
          Delete folder…
        </button>
      </template>
      <template v-else-if="contextMenu.target === 'server'">
        <div
          class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle border-b border-border"
        >
          Move to folder
        </div>
        <button
          v-if="folderForServer(contextMenu.serverId)"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="assignServerToFolderFromMenu(null)"
        >
          <img :src="icons.arrowLeft" alt="" :class="menuItemIconClass" />
          Remove from folder
        </button>
        <button
          v-for="f in folders"
          :key="'fm-' + f.id"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="assignServerToFolderFromMenu(f.id)"
        >
          <img :src="iconFolder" alt="" :class="menuItemIconClass" />
          Move to “{{ f.name }}”
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="newFolderFromContextMenu"
        >
          <img :src="icons.plus" alt="" :class="menuItemIconClass" />
          New folder with this server…
        </button>
      </template>
    </div>
  </Teleport>
</template>
