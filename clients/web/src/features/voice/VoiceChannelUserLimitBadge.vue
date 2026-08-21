<script setup lang="ts">
import { computed } from 'vue';
import type { VoiceChannelUserLimitTone } from '@/features/voice/voiceChannelUserLimit';

const props = withDefaults(
  defineProps<{
    label: string;
    tone?: VoiceChannelUserLimitTone;
    size?: 'sm' | 'md';
    title?: string;
  }>(),
  {
    tone: 'muted',
    size: 'sm',
  },
);

const toneClass = computed(() => {
  switch (props.tone) {
    case 'full':
      return 'voice-channel-limit-badge--full';
    case 'warning':
      return 'voice-channel-limit-badge--warning';
    default:
      return 'voice-channel-limit-badge--muted';
  }
});

const sizeClass = computed(() =>
  props.size === 'md' ? 'voice-channel-limit-badge--md' : '',
);
</script>

<template>
  <span
    class="voice-channel-limit-badge tabular-nums font-medium"
    :class="[toneClass, sizeClass]"
    :title="title"
    >{{ label }}</span
  >
</template>

<style scoped lang="scss">
.voice-channel-limit-badge {
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.voice-channel-limit-badge--md {
  font-size: 12px;
}

.voice-channel-limit-badge--muted {
  color: var(--muted);
}

.voice-channel-limit-badge--warning {
  color: var(--server-ping-broadcast);
}

.voice-channel-limit-badge--full {
  color: var(--server-ping-personal);
}
</style>
