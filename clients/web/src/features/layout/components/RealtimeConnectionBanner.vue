<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
import {
  REALTIME_BANNER_CONNECTED_HOLD_MS,
  useRealtimeConnectionBanner,
} from '@/features/layout/composables/realtime/useRealtimeConnectionBanner';

const { state } = useRealtimeConnectionBanner({
  connectedHoldMs: REALTIME_BANNER_CONNECTED_HOLD_MS,
});

const statusLabel = computed(() =>
  state.value === 'reconnecting'
    ? echoT('layout.realtime.reconnecting')
    : echoT('layout.realtime.connected'),
);

const showLabel = computed(() => state.value === 'reconnecting');
</script>

<template>
  <Teleport to="body">
    <Transition name="realtime-status-fade">
      <div
        v-if="state !== 'hidden'"
        class="realtime-connection-status"
        :class="`realtime-connection-status--${state}`"
        role="status"
        :aria-label="statusLabel"
      >
        <span class="realtime-connection-status__dot" aria-hidden="true" />
        <span v-if="showLabel" class="realtime-connection-status__label">
          {{ statusLabel }}
        </span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./styles/RealtimeConnectionBanner.scss"></style>
