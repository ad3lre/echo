<script setup lang="ts">
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
    aria-label="Voice activity host"
    title="Voice activity host"
    focusable="false"
  >
    <path :d="iconCrownSvgPath" fill="currentColor" />
  </svg>
</template>
