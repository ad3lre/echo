<script setup lang="ts">
import type { ServerSettingsSection } from '@/features/server-settings/types';
import { SECTION_COPY } from '@/features/server-settings/types';

withDefaults(
  defineProps<{
    activeSection: ServerSettingsSection;
    getSectionIcon: (section: ServerSettingsSection) => string;
    /** Mobile stack: show Back button (swipe-right still works). */
    showBack?: boolean;
  }>(),
  {
    showBack: false,
  },
);

const emit = defineEmits<{
  close: [];
  back: [];
}>();
</script>

<template>
  <div class="mb-6 flex shrink-0 items-start justify-between gap-4">
    <div>
      <div
        class="text-xs font-semibold uppercase tracking-[0.18em] text-fg-soft"
      >
        Server
      </div>
      <div class="mt-2 flex items-center gap-3">
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
          class="server-settings-header-section-icon h-6 w-6"
        />
        <h3 class="text-3xl font-bold">{{ activeSection }}</h3>
      </div>
      <p class="mt-2 max-w-2xl text-sm text-fg-soft">
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
