<script setup lang="ts">
import { useCompactShellVisualViewportFrame } from '@/composables/useCompactShellVisualViewportFrame';

const { rootStyle } = useCompactShellVisualViewportFrame();
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden"
    :style="rootStyle"
  >
    <slot />
  </div>
</template>
