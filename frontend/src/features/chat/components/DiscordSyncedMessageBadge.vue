<script setup lang="ts">
import { icons } from '@/assets/icons';

withDefaults(
  defineProps<{
    /** Tighter layout for grouped continuation rows (icon + short label). */
    compact?: boolean;
  }>(),
  { compact: false },
);
</script>

<template>
  <span
    class="discord-synced-badge inline-flex w-fit shrink-0 items-center gap-1 rounded bg-indigo-500/15 font-bold uppercase tracking-wider text-indigo-400 ring-1 ring-indigo-500/25"
    :class="
      compact
        ? 'px-1 py-px text-[8px] leading-none'
        : 'px-1.5 py-0.5 text-[9px] leading-none'
    "
    title="Synced from Discord"
    data-echo-hint="Synced from Discord"
    aria-label="Synced from Discord"
  >
    <img
      :src="icons.discordMark"
      alt=""
      class="shrink-0 opacity-90"
      :class="compact ? 'h-2.5 w-2.5' : 'h-3 w-3'"
      aria-hidden="true"
    />
    <span>Discord</span>
  </span>
</template>
