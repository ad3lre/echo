<script setup lang="ts">
import { computed } from 'vue';
import {
  REALTIME_BANNER_CONNECTED_HOLD_MS,
  useRealtimeConnectionBanner,
} from '@/features/layout/composables/useRealtimeConnectionBanner';

const { state } = useRealtimeConnectionBanner({
  connectedHoldMs: REALTIME_BANNER_CONNECTED_HOLD_MS,
});

const statusLabel = computed(() =>
  state.value === 'reconnecting' ? 'Reconnecting' : 'Connected',
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

<style scoped>
.realtime-connection-status {
  --realtime-status-accent: var(--paper-status-pending, #f5a623);
  position: fixed;
  top: calc(0.5rem + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 85;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  max-width: calc(100% - 1.5rem);
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--realtime-status-accent) 88%, white 12%);
  background: color-mix(
    in srgb,
    var(--realtime-status-accent) 14%,
    var(--elevated, #1f2128)
  );
  border: 1px solid
    color-mix(in srgb, var(--realtime-status-accent) 42%, transparent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(8px);
  pointer-events: none;
  white-space: nowrap;
}

.realtime-connection-status--connected {
  --realtime-status-accent: var(--accent-positive, #3ba55d);
  padding-inline: 0.45rem;
}

.realtime-connection-status__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.realtime-connection-status__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--realtime-status-accent);
}

.realtime-connection-status--reconnecting .realtime-connection-status__dot {
  animation: realtime-status-pulse 1.1s ease-in-out infinite;
}

@keyframes realtime-status-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.realtime-status-fade-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.realtime-status-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.realtime-connection-status--connected.realtime-status-fade-leave-active {
  transition:
    opacity 1s ease,
    transform 1s ease;
}

.realtime-status-fade-enter-from,
.realtime-status-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-0.35rem);
}

@media (prefers-reduced-motion: reduce) {
  .realtime-connection-status--reconnecting .realtime-connection-status__dot {
    animation: none;
  }

  .realtime-status-fade-enter-active,
  .realtime-status-fade-leave-active,
  .realtime-connection-status--connected.realtime-status-fade-leave-active {
    transition: opacity 0.2s ease;
  }

  .realtime-status-fade-enter-from,
  .realtime-status-fade-leave-to {
    transform: translateX(-50%);
  }
}
</style>
