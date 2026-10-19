<script setup lang="ts">
import { echoT } from '@/i18n';
import { icons } from '@/assets/icons';

withDefaults(
  defineProps<{
    /** Accessible name + tooltip (e.g. "From Discord", "Discord profile"). */
    label?: string;
    /** Visual size of the mark. */
    size?: 'sm' | 'md';
  }>(),
  {
    size: 'sm',
  },
);
</script>

<template>
  <span
    class="discord-origin-mark inline-flex shrink-0 items-center justify-center"
    :title="label ?? echoT('b44.discordOrigin.fromDiscord')"
    :data-echo-hint="label ?? echoT('b44.discordOrigin.fromDiscord')"
    :aria-label="label ?? echoT('b44.discordOrigin.fromDiscord')"
    role="img"
  >
    <img
      :src="icons.discordMark"
      alt=""
      class="shrink-0 opacity-90 filter invert"
      :class="size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'"
      aria-hidden="true"
    />
  </span>
</template>
