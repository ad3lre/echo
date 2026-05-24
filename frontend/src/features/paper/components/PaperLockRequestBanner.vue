<script setup lang="ts">
defineProps<{
  fromDisplayName: string;
}>();

const emit = defineEmits<{
  release: [];
  dismiss: [];
}>();
</script>

<template>
  <div class="paper-lock-request-banner" role="status">
    <span class="paper-lock-request-banner__text">
      {{ fromDisplayName }} wants to edit this paragraph
    </span>
    <div class="paper-lock-request-banner__actions">
      <button
        type="button"
        class="paper-lock-request-banner__btn paper-lock-request-banner__btn--primary"
        @click="emit('release')"
      >
        Release
      </button>
      <button
        type="button"
        class="paper-lock-request-banner__btn"
        @click="emit('dismiss')"
      >
        Dismiss
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-lock-request-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 28rem;
  margin: 0 auto;
  padding: 0.375rem 0.625rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
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

.paper-lock-request-banner__text {
  flex: 1;
  min-width: 0;
}

.paper-lock-request-banner__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.35rem;
}

.paper-lock-request-banner__btn {
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--muted);
}

.paper-lock-request-banner__btn:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.paper-lock-request-banner__btn--primary {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.paper-lock-request-banner__btn--primary:hover {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
}
</style>
