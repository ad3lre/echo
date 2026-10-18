<script setup lang="ts">
import DiscordOriginMark from '@/features/discord/DiscordOriginMark.vue';

withDefaults(
  defineProps<{
    /** Kept for existing callers; mark is logo-only. */
    compact?: boolean;
  }>(),
  { compact: false },
);
</script>

<template>
  <DiscordOriginMark class="discord-synced-badge" label="From Discord" />
</template>
