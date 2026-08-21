<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { resolveAppLayoutLoadHintMs } from '@/config/appLoadUi';
import { reloadEchoApp } from '@/platform/reloadEchoApp';

const showSlowHint = ref(false);
let hintTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  hintTimer = setTimeout(() => {
    showSlowHint.value = true;
  }, resolveAppLayoutLoadHintMs());
});

onUnmounted(() => {
  if (hintTimer !== undefined) clearTimeout(hintTimer);
});

function reload() {
  reloadEchoApp();
}
</script>

<template>
  <div
    class="echo-app-splash echo-app-splash--async h-full w-full min-h-0 bg-bg"
    role="status"
    aria-live="polite"
    aria-label="Loading Echo"
  >
    <div class="echo-app-splash__inner">
      <svg
        class="echo-ios-spinner"
        viewBox="0 0 44 44"
        width="40"
        height="40"
        aria-hidden="true"
      >
        <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
        <circle
          class="echo-ios-spinner__arc"
          cx="22"
          cy="22"
          r="18"
          transform="rotate(-90 22 22)"
        />
      </svg>

      <div
        v-if="showSlowHint"
        class="echo-app-splash__hint"
        role="region"
        aria-label="Loading is taking longer than usual"
      >
        <p class="echo-app-splash__hint-title">Still loading…</p>
        <p class="echo-app-splash__hint-lead">This can happen when:</p>
        <ul class="echo-app-splash__hint-list">
          <li>Your connection is slow or unstable</li>
          <li>
            This is your first visit (the app is downloading in the background)
          </li>
          <li>
            A browser extension or strict privacy mode is blocking scripts
          </li>
        </ul>
        <p class="echo-app-splash__hint-foot">
          If nothing changes after a while, try refreshing the page.
        </p>
        <button type="button" class="echo-app-splash__retry" @click="reload">
          Refresh page
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.echo-app-splash__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  min-height: 100%;
  padding: 1.5rem;
  text-align: center;
}

.echo-app-splash__hint {
  max-width: 22rem;
}

.echo-app-splash__hint-title {
  margin: 0 0 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
}

.echo-app-splash__hint-lead,
.echo-app-splash__hint-foot {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--muted);
}

.echo-app-splash__hint-list {
  margin: 0 0 0.75rem;
  padding-left: 1.25rem;
  text-align: left;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--muted);
}

.echo-app-splash__retry {
  margin-top: 0.5rem;
  cursor: pointer;
  border: none;
  border-radius: 0.75rem;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
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
