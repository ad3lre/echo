<script setup lang="ts">
import { computed } from 'vue';
import { reloadEchoApp } from '@/platform/reloadEchoApp';

/**
 * Shown when the AppLayout lazy chunk fails to load or hits defineAsyncComponent timeout.
 * Vue passes `error` from the async wrapper when `errorComponent` is used.
 */
const props = defineProps<{
  error?: Error;
}>();

function reload() {
  reloadEchoApp();
}

const errorDetail = computed(() => {
  const m = props.error?.message?.trim();
  if (!m) return null;
  if (/^Async component timed out after \d+ms\.$/.test(m)) {
    return 'The download took too long and was stopped. Check your network and try again.';
  }
  if (/Failed to fetch|Load failed|network/i.test(m)) {
    return 'We could not reach the server to load this part of the app. Check your connection.';
  }
  return null;
});
</script>

<template>
  <div
    class="echo-app-splash echo-app-load-error h-full w-full min-h-0 bg-bg"
    role="alert"
    aria-live="assertive"
  >
    <div class="echo-app-load-error__inner">
      <p class="echo-app-load-error__title">Couldn’t load Echo</p>
      <p v-if="errorDetail" class="echo-app-load-error__detail">
        {{ errorDetail }}
      </p>
      <p v-else class="echo-app-load-error__detail">
        Something went wrong while loading the app. Try refreshing, or come back
        in a moment.
      </p>
      <button type="button" class="echo-app-load-error__retry" @click="reload">
        Refresh page
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.echo-app-load-error__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 100%;
  padding: 1.5rem;
  text-align: center;
}

.echo-app-load-error__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.echo-app-load-error__detail {
  margin: 0;
  max-width: 24rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--muted);
}

.echo-app-load-error__retry {
  margin-top: 0.25rem;
  cursor: pointer;
  border: none;
  border-radius: 0.75rem;
  padding: 0.55rem 1.1rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--accent);
  color: var(--accent-contrast-fg);
  transition: filter 0.15s ease;

  &:hover {
    filter: brightness(1.06);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
}
</style>
