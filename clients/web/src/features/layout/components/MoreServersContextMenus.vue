<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { icons } from '@/assets/icons';
import MoreServerFolderAssignMenuItems from '@/features/layout/components/MoreServerFolderAssignMenuItems.vue';
import type { MoreServersMockServer } from '@/features/layout/composables/more-servers/useMoreServers';
import type { MoreServerWidgetFolder } from '@/features/layout/composables/more-servers/useMoreServerFolders';
import type { WidgetFolderContextMenu } from '@/features/layout/composables/more-servers/useMoreServersMenus';

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
      <MoreServerFolderAssignMenuItems
        :folders="folders"
        :current-folder-id="folderForServer(openMenuServer.id)?.id ?? null"
        :show-remove="!!folderForServer(openMenuServer.id)"
        @assign="assignServerToFolder(openMenuServer.id, $event)"
        @remove="assignServerToFolder(openMenuServer.id, null)"
        @new-folder="newFolderWithServer(openMenuServer.id)"
      />
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
          Widget folder
        </div>
        <MoreServerFolderAssignMenuItems
          :folders="folders"
          :current-folder-id="folderForServer(contextMenu.serverId)?.id ?? null"
          :show-remove="!!folderForServer(contextMenu.serverId)"
          @assign="assignServerToFolderFromMenu($event)"
          @remove="assignServerToFolderFromMenu(null)"
          @new-folder="newFolderFromContextMenu"
        />
      </template>
    </div>
  </Teleport>
</template>
