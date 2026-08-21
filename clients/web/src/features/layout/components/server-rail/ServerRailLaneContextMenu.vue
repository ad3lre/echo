<script setup lang="ts">
import { icons } from '@/assets/icons';

defineProps<{
  menuOpen: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarded to :ref like ServerRailContextMenu
  menuRef?: any;
  menuPosition: { left: number; top: number };
  title: string;
}>();

const emit = defineEmits<{
  'mark-all-read': [];
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menuOpen"
      :ref="menuRef"
      class="ellipsis-menu fixed z-[120] min-w-[220px] py-1"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
      role="menu"
      :aria-label="`${title} options`"
      @mousedown.stop
      @contextmenu.prevent
    >
      <div
        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle truncate border-b border-border"
      >
        {{ title }}
      </div>
      <button
        type="button"
        class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        role="menuitem"
        @click="emit('mark-all-read')"
      >
        <img
          :src="icons.friendAdded"
          alt=""
          class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
        />
        Mark all as read
      </button>
    </div>
  </Teleport>
</template>
