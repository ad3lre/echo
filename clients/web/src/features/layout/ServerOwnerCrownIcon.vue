<script setup lang="ts">
import { iconCrownSvgPath } from '@/assets/icons';

defineProps<{
  /** Optional Tailwind size override (default small, compact). */
  iconClass?: string;
}>();
</script>

<template>
  <svg
    :class="iconClass ?? 'h-3.5 w-3.5'"
    class="inline-block shrink-0 text-amber-400"
    viewBox="0 0 24 24"
    role="img"
    aria-label="Server owner"
    title="Server owner"
    focusable="false"
  >
    <path :d="iconCrownSvgPath" fill="currentColor" />
  </svg>
</template>
