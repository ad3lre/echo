<script setup lang="ts">
import type { ServerSettingsSection } from '@/features/server-settings/types';
import { SECTION_COPY } from '@/features/server-settings/types';

withDefaults(
  defineProps<{
    activeSection: ServerSettingsSection;
    getSectionIcon: (section: ServerSettingsSection) => string;
    /** Mobile stack: show Back button (swipe-right still works). */
    showBack?: boolean;
    /** Narrow server settings: icon-first title row, tighter copy. */
    compact?: boolean;
  }>(),
  {
    showBack: false,
    compact: false,
  },
);

const emit = defineEmits<{
  close: [];
  back: [];
}>();
</script>

<template>
  <div
    class="mb-6 flex shrink-0 items-start justify-between gap-4"
    :class="compact ? 'mb-4 gap-3' : ''"
  >
    <div class="min-w-0">
      <div
        class="font-semibold uppercase tracking-[0.18em] text-fg-soft"
        :class="compact ? 'text-[10px]' : 'text-xs'"
      >
        Server
      </div>
      <div
        class="mt-2 flex min-w-0 items-center gap-3"
        :class="compact ? 'gap-2.5' : ''"
      >
        <button
          v-if="showBack"
          type="button"
          class="rounded-lg px-2 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
          @click="emit('back')"
        >
          Back
        </button>
        <img
          :src="getSectionIcon(activeSection)"
          alt=""
          class="server-settings-header-section-icon shrink-0"
          :class="compact ? 'h-7 w-7' : 'h-6 w-6'"
        />
        <h3
          class="min-w-0 flex-1 truncate font-bold leading-tight"
          :class="compact ? 'text-xl' : 'text-3xl'"
        >
          {{ activeSection }}
        </h3>
      </div>
      <p
        v-if="!compact"
        class="mt-2 max-w-2xl text-sm text-fg-soft"
      >
        {{ SECTION_COPY[activeSection] }}
      </p>
      <p
        v-else
        class="mt-1.5 max-w-2xl text-xs leading-snug text-fg-soft line-clamp-2"
      >
        {{ SECTION_COPY[activeSection] }}
      </p>
    </div>

    <button
      type="button"
      class="close-btn shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
      @click="emit('close')"
    >
      Close
    </button>
  </div>
</template>
