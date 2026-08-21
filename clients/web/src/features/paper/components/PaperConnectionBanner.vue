<script setup lang="ts">
defineProps<{
  message: string;
  canReconnect?: boolean;
}>();

const emit = defineEmits<{
  dismiss: [];
  reconnect: [];
}>();
</script>

<template>
  <div class="paper-connection-banner" role="status">
    <span class="paper-connection-banner__text">{{ message }}</span>
    <div class="paper-connection-banner__actions">
      <button
        v-if="canReconnect"
        type="button"
        class="paper-connection-banner__btn paper-connection-banner__btn--primary"
        @click="emit('reconnect')"
      >
        Retry
      </button>
      <button
        type="button"
        class="paper-connection-banner__btn"
        aria-label="Dismiss"
        @click="emit('dismiss')"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-connection-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 30rem;
  margin: 0 auto;
  padding: 0.375rem 0.625rem;
  border-radius: 8px;
  border: 1px solid
    color-mix(in srgb, var(--paper-status-pending) 35%, var(--border));
  background: color-mix(
    in srgb,
    var(--paper-chrome-bg, var(--elevated)) 96%,
    transparent
  );
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.paper-connection-banner__text {
  flex: 1;
  min-width: 0;
}

.paper-connection-banner__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
}

.paper-connection-banner__btn {
  border-radius: 6px;
  padding: 0.2rem 0.45rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--muted);
}

.paper-connection-banner__btn:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.paper-connection-banner__btn--primary {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.paper-connection-banner__btn--primary:hover {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
}
</style>
