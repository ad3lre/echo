<script setup lang="ts">
import { useCompactShellVisualViewportFrame } from '@/composables/useCompactShellVisualViewportFrame';

const { rootStyle } = useCompactShellVisualViewportFrame();
</script>

<template>
  <div
    class="compact-guild-split-root relative flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden"
    :style="rootStyle"
  >
    <div
      class="compact-guild-split-left flex h-full min-h-0 shrink-0 flex-row overflow-hidden"
    >
      <slot name="left" />
    </div>
    <div
      class="compact-guild-split-chat flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <slot name="chat" />
    </div>
    <slot name="members-overlay" />
  </div>
</template>
