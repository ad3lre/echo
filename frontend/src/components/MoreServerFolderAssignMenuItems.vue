<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import iconFolder from '@/assets/icons/folder.svg?url';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';

const FOLDER_SEARCH_MIN = 4;

const menuItemIconClass =
  'echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert';

const props = defineProps<{
  folders: MoreServerWidgetFolder[];
  currentFolderId: string | null;
  showRemove: boolean;
}>();

const emit = defineEmits<{
  assign: [folderId: string];
  remove: [];
  'new-folder': [];
}>();

const submenuOpen = ref(false);
const searchQuery = ref('');

const showSearch = computed(() => props.folders.length >= FOLDER_SEARCH_MIN);

const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase());

const assignableFolders = computed(() => {
  const q = normalizedSearch.value;
  return props.folders.filter((folder) => {
    if (folder.id === props.currentFolderId) return false;
    if (!q) return true;
    return folder.name.toLowerCase().includes(q);
  });
});

function toggleSubmenu() {
  submenuOpen.value = !submenuOpen.value;
  if (!submenuOpen.value) searchQuery.value = '';
}

function pickFolder(folderId: string) {
  emit('assign', folderId);
  submenuOpen.value = false;
  searchQuery.value = '';
}
</script>

<template>
  <button
    v-if="showRemove"
    type="button"
    class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
    role="menuitem"
    @click="emit('remove')"
  >
    <img :src="icons.arrowLeft" alt="" :class="menuItemIconClass" />
    Remove from folder
  </button>

  <div v-if="folders.length > 0">
    <button
      type="button"
      class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      role="menuitem"
      :aria-expanded="submenuOpen ? 'true' : 'false'"
      @click="toggleSubmenu"
    >
      <img :src="iconFolder" alt="" :class="menuItemIconClass" />
      <span class="min-w-0 flex-1 truncate">Move to folder</span>
      <span class="shrink-0 text-xs text-fg-subtle" aria-hidden="true">{{
        submenuOpen ? '▾' : '▸'
      }}</span>
    </button>
    <div
      v-if="submenuOpen"
      class="more-server-folder-submenu border-t border-border"
      @mousedown.stop
    >
      <div v-if="showSearch" class="px-2 py-1.5">
        <label class="sr-only" for="more-server-folder-submenu-search"
          >Search folders</label
        >
        <input
          id="more-server-folder-submenu-search"
          v-model="searchQuery"
          type="search"
          class="more-server-folder-submenu__search w-full rounded-md px-2 py-1.5 text-xs outline-none"
          placeholder="Search folders…"
          autocomplete="off"
          @keydown.stop
        />
      </div>
      <div
        v-if="assignableFolders.length > 0"
        class="custom-scrollbar max-h-52 overflow-y-auto py-1"
      >
        <button
          v-for="folder in assignableFolders"
          :key="'folder-pick-' + folder.id"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 pl-6 pr-3 py-1.5 text-left text-xs"
          role="menuitem"
          :title="'Move to “' + folder.name + '”'"
          @click="pickFolder(folder.id)"
        >
          <img
            :src="iconFolder"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-3.5 w-3.5 shrink-0 filter invert opacity-80"
          />
          <span class="min-w-0 truncate">{{ folder.name }}</span>
        </button>
      </div>
      <p v-else class="px-3 py-2 text-xs leading-snug text-fg-subtle">
        {{
          normalizedSearch
            ? 'No folders match your search.'
            : 'No other folders to move into.'
        }}
      </p>
    </div>
  </div>

  <button
    type="button"
    class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
    role="menuitem"
    @click="emit('new-folder')"
  >
    <img :src="icons.plus" alt="" :class="menuItemIconClass" />
    New folder with this server…
  </button>
</template>

<style scoped lang="scss">
.more-server-folder-submenu__search {
  color: var(--menu-item-fg);
  background: color-mix(in srgb, var(--bg) 45%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  &::placeholder {
    color: var(--fg-subtle, var(--menu-item-disabled-fg));
  }
  &:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
}
</style>
