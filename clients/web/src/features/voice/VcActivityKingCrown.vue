<script setup lang="ts">
import { echoT } from '@/i18n';
import { iconCrownSvgPath } from '@/assets/icons';

defineProps<{
  iconClass?: string;
}>();
</script>

<template>
  <svg
    :class="iconClass ?? 'h-3 w-3'"
    class="inline-block shrink-0 text-violet-400"
    viewBox="0 0 24 24"
    role="img"
    :aria-label="echoT('b14.voice.hostCrown')"
    :title="echoT('b14.voice.hostCrown')"
    focusable="false"
  >
    <path :d="iconCrownSvgPath" fill="currentColor" />
  </svg>
</template>
