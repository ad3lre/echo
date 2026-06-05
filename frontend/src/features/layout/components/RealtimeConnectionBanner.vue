<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useEchoSessionStore } from '@/stores/echoSession';
import { useRealtimeConnectionBanner } from '@/features/layout/composables/useRealtimeConnectionBanner';

const echoSession = useEchoSessionStore();
const { liveSyncConnected } = storeToRefs(echoSession);
const { state } = useRealtimeConnectionBanner({ connected: liveSyncConnected });
</script>

<template>
  <Transition name="realtime-banner-fade">
    <div
      v-if="state !== 'hidden'"
      class="realtime-connection-banner"
      :data-state="state"
      role="status"
      aria-live="polite"
    >
      <span
        v-if="state === 'reconnecting'"
        class="realtime-connection-banner__dot realtime-connection-banner__dot--pulse"
        aria-hidden="true"
      />
      <span
        v-else
        class="realtime-connection-banner__dot realtime-connection-banner__dot--ok"
        aria-hidden="true"
      />
      <span class="realtime-connection-banner__text">
        {{
          state === 'reconnecting' ? 'Reconnecting to realtime…' : 'Reconnected'
        }}
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.realtime-connection-banner {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: calc(100% - 1.5rem);
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  line-height: 1.2;
  font-weight: 500;
  color: var(--foreground, var(--text));
  background: color-mix(in srgb, var(--elevated, #1f2128) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(8px);
  pointer-events: none;
  white-space: nowrap;
}

.realtime-connection-banner__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.realtime-connection-banner__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.realtime-connection-banner__dot--pulse {
  background: var(--paper-status-pending, #f5a623);
  animation: realtime-banner-pulse 1.1s ease-in-out infinite;
}

.realtime-connection-banner__dot--ok {
  background: var(--accent-positive, #3ba55d);
}

@keyframes realtime-banner-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.realtime-banner-fade-enter-active,
.realtime-banner-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.realtime-banner-fade-enter-from,
.realtime-banner-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-0.35rem);
}

@media (prefers-reduced-motion: reduce) {
  .realtime-connection-banner__dot--pulse {
    animation: none;
  }
  .realtime-banner-fade-enter-active,
  .realtime-banner-fade-leave-active {
    transition: opacity 0.2s ease;
  }
  .realtime-banner-fade-enter-from,
  .realtime-banner-fade-leave-to {
    transform: translateX(-50%);
  }
}
</style>
