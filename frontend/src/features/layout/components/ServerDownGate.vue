<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    checking?: boolean;
    outageSinceMs?: number | null;
    lastCheckedAtMs?: number | null;
    detail?: string | null;
  }>(),
  {
    checking: false,
    outageSinceMs: null,
    lastCheckedAtMs: null,
    detail: null,
  },
);

const emit = defineEmits<{
  retry: [];
}>();

/** Ticks every second to drive the live downtime and "checked ago" counters. */
const nowMs = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  clock = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (clock != null) {
    clearInterval(clock);
    clock = null;
  }
});

/** Formats a millisecond duration as "Xh Ym Zs", "Ym Zs", or "Zs". */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Live-updating label for how long the outage has been ongoing. */
const outageDurationLabel = computed(() => {
  if (!props.outageSinceMs) return 'Detecting outage…';
  return formatDuration(nowMs.value - props.outageSinceMs);
});

/** Live-updating label for how long ago the last health check ran. */
const checkedAgoLabel = computed(() => {
  if (!props.lastCheckedAtMs) return 'Checking now…';
  return `${formatDuration(nowMs.value - props.lastCheckedAtMs)} ago`;
});
</script>

<template>
  <section
    class="server-down-gate flex min-h-full w-full items-center justify-center px-4 py-6 sm:px-6 sm:py-8"
    role="region"
    aria-label="Service status"
  >
    <div
      class="server-down-card w-full max-w-2xl rounded-3xl border border-border p-6 text-fg sm:p-8"
    >
      <div
        class="server-down-icon-wrap mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </div>

      <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">
        Echo server is currently down
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-fg-soft sm:text-base">
        We are retrying in real time and will reconnect automatically once
        service is healthy again.
      </p>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <div class="rounded-2xl bg-glass-1 px-4 py-3">
          <p
            class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
          >
            Downtime
          </p>
          <p class="mt-1 text-base font-semibold text-fg">
            {{ outageDurationLabel }}
          </p>
        </div>
        <div class="rounded-2xl bg-glass-1 px-4 py-3">
          <p
            class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
          >
            Last health check
          </p>
          <p class="mt-1 text-base font-semibold text-fg">
            {{ checkedAgoLabel }}
          </p>
        </div>
      </div>

      <p
        v-if="detail"
        class="server-down-detail mt-4 text-xs leading-relaxed text-fg-soft"
      >
        {{ detail }}
      </p>

      <div class="mt-6 flex items-center gap-2">
        <span
          class="server-down-status-dot inline-flex h-2.5 w-2.5 rounded-full"
          :class="
            checking
              ? 'server-down-status-dot--checking animate-pulse'
              : 'server-down-status-dot--waiting'
          "
          aria-hidden="true"
        />
        <span class="text-xs text-fg-soft">
          {{ checking ? 'Checking server status…' : 'Waiting for recovery…' }}
        </span>
      </div>

      <button
        type="button"
        class="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-glass-2 px-4 text-sm font-semibold text-fg transition-colors hover:bg-glass-hover"
        @click="emit('retry')"
      >
        Check again now
      </button>
    </div>
  </section>
</template>

<style scoped>
/*
 * Light-first: default rules use semantic tokens so default/light reads correctly
 * without extra selectors; dark theme is layered with :global(html[data-theme='dark']).
 */

/* --- Page canvas -------------------------------------------------------- */
.server-down-gate {
  background:
    radial-gradient(
      circle at 18% 8%,
      color-mix(in srgb, var(--accent) 20%, transparent),
      transparent 48%
    ),
    radial-gradient(
      circle at 88% 92%,
      color-mix(in srgb, rgb(244 63 94) 12%, transparent),
      transparent 52%
    ),
    radial-gradient(
      ellipse 120% 85% at 50% 115%,
      color-mix(in srgb, var(--accent) 8%, transparent),
      transparent 58%
    ),
    linear-gradient(
      185deg,
      color-mix(in srgb, var(--bg) 94%, white 6%) 0%,
      var(--bg) 48%,
      color-mix(in srgb, var(--surface) 88%, var(--bg) 12%) 100%
    );
}

:global(html[data-theme='dark']) .server-down-gate {
  background:
    radial-gradient(
      circle at 20% 0%,
      rgba(124, 58, 237, 0.16),
      transparent 45%
    ),
    radial-gradient(
      circle at 85% 100%,
      rgba(244, 63, 94, 0.14),
      transparent 46%
    ),
    linear-gradient(180deg, rgba(10, 7, 18, 0.98) 0%, rgba(7, 5, 14, 1) 100%);
}

:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .server-down-gate {
  background:
    radial-gradient(circle at 18% 6%, rgba(217, 119, 6, 0.1), transparent 46%),
    radial-gradient(
      circle at 82% 92%,
      rgba(244, 63, 94, 0.07),
      transparent 50%
    ),
    linear-gradient(
      185deg,
      color-mix(in srgb, var(--bg) 94%, #fff8f0 6%) 0%,
      var(--bg) 100%
    );
}

/* --- Card --------------------------------------------------------------- */
.server-down-card {
  background:
    radial-gradient(
      circle at 62% -6%,
      color-mix(in srgb, var(--accent) 12%, transparent),
      transparent 58%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--elevated) 98%, var(--accent) 2%) 0%,
      color-mix(in srgb, var(--surface) 95%, var(--bg) 5%) 100%
    );
  border-color: color-mix(in srgb, var(--border) 88%, transparent);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 85%, var(--border) 15%) inset,
    0 18px 44px color-mix(in srgb, rgb(15 23 42) 8%, transparent),
    0 6px 14px color-mix(in srgb, rgb(15 23 42) 5%, transparent);
}

:global(html[data-theme='dark']) .server-down-card {
  background:
    radial-gradient(circle at 60% 0%, rgba(96, 165, 250, 0.1), transparent 54%),
    linear-gradient(
      180deg,
      rgba(18, 14, 32, 0.94) 0%,
      rgba(11, 9, 22, 0.98) 100%
    );
  border-color: color-mix(in srgb, white 10%, transparent);
  backdrop-filter: blur(20px) saturate(1.25);
  -webkit-backdrop-filter: blur(20px) saturate(1.25);
  box-shadow:
    0 -1px 0 rgba(255, 255, 255, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.55);
}

/* Error icon chip -------------------------------------------------------- */
.server-down-icon-wrap {
  background: color-mix(in srgb, rgb(244 63 94) 14%, var(--elevated) 86%);
  color: color-mix(in srgb, rgb(190 18 60) 92%, var(--text) 8%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, rgb(244 63 94) 22%, transparent) inset,
    0 1px 2px color-mix(in srgb, rgb(15 23 42) 6%, transparent);
}

:global(html[data-theme='dark']) .server-down-icon-wrap {
  background: rgba(244, 63, 94, 0.2);
  color: rgb(254 205 211);
  box-shadow: none;
}

:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .server-down-icon-wrap {
  background: color-mix(in srgb, rgb(234 88 12) 14%, var(--elevated) 86%);
  color: rgb(194 65 12);
  box-shadow:
    0 0 0 1px color-mix(in srgb, rgb(234 88 12) 24%, transparent) inset,
    0 1px 2px color-mix(in srgb, rgb(120 53 15) 8%, transparent);
}

/* Technical detail ------------------------------------------------------- */
.server-down-detail {
  font-family:
    ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  word-break: break-word;
  color: color-mix(in srgb, var(--muted) 94%, var(--text) 6%);
  background: color-mix(in srgb, var(--surface) 90%, var(--bg) 10%);
  border-radius: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
}

:global(html[data-theme='dark']) .server-down-detail {
  color: rgba(226, 232, 240, 0.88);
  background: rgba(0, 0, 0, 0.28);
  border-color: rgba(255, 255, 255, 0.1);
}

/* Status dots ------------------------------------------------------------ */
.server-down-status-dot--checking {
  background: rgb(217 119 6);
}

.server-down-status-dot--waiting {
  background: rgb(225 29 72);
}

:global(html[data-theme='dark']) .server-down-status-dot--checking {
  background: rgb(252 211 77);
}

:global(html[data-theme='dark']) .server-down-status-dot--waiting {
  background: rgb(251 113 133);
}
</style>
