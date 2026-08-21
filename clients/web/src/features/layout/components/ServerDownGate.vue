<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useCompactShell } from '@/features/layout/useCompactShell';

const { isCompactShell } = useCompactShell();

const props = withDefaults(
  defineProps<{
    checking?: boolean;
    outageSinceMs?: number | null;
    lastCheckedAtMs?: number | null;
    detail?: string | null;
    /** Expected recovery length (seconds); from local past recoveries or a default. */
    averageRecoverySeconds?: number;
    /** How many completed recoveries shaped the average (0 = default only). */
    recoverySampleCount?: number;
  }>(),
  {
    checking: false,
    outageSinceMs: null,
    lastCheckedAtMs: null,
    detail: null,
    averageRecoverySeconds: 60,
    recoverySampleCount: 0,
  },
);

const emit = defineEmits<{
  retry: [];
  refresh: [];
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

const estimateSeconds = computed(() =>
  Math.max(15, Math.floor(props.averageRecoverySeconds)),
);

const outageElapsedSeconds = computed(() => {
  if (!props.outageSinceMs) return 0;
  return Math.max(0, Math.floor((nowMs.value - props.outageSinceMs) / 1000));
});

const recoveryProgressPercent = computed(() => {
  const est = estimateSeconds.value;
  if (est <= 0) return 0;
  return Math.min(100, (outageElapsedSeconds.value / est) * 100);
});

const recoveryRemainingSeconds = computed(() =>
  Math.max(0, estimateSeconds.value - outageElapsedSeconds.value),
);

const typicalRecoveryTitle = computed(() =>
  props.recoverySampleCount > 0 ? 'Avg. recovery' : 'Typical recovery',
);

const typicalRecoveryValue = computed(() =>
  formatDuration(estimateSeconds.value * 1000),
);

const typicalRecoveryHint = computed(() => {
  if (props.recoverySampleCount > 0) {
    return `Based on ${props.recoverySampleCount} past outage${props.recoverySampleCount === 1 ? '' : 's'} on this device`;
  }
  return 'Default until we learn from your reconnects';
});

const recoveryTimerLine = computed(() => {
  if (!props.outageSinceMs) {
    return `Typical window about ${formatDuration(estimateSeconds.value * 1000)}`;
  }
  const rem = recoveryRemainingSeconds.value;
  if (rem > 0) {
    return `About ${rem}s remaining vs typical ${estimateSeconds.value}s`;
  }
  return 'Past your usual recovery window — still reconnecting';
});

const progressAriaLabel = computed(
  () =>
    `Recovery progress versus typical ${estimateSeconds.value} second window`,
);
</script>

<template>
  <Teleport to="body">
    <div
      class="server-down-overlay fixed inset-0 z-[230] overflow-x-hidden overflow-y-auto"
      role="presentation"
    >
      <div
        class="server-down-overlay-frame flex w-full"
        :class="
          isCompactShell
            ? 'min-h-[100dvh] flex-col'
            : 'min-h-[100dvh] items-center justify-center px-4 py-6 sm:px-6 sm:py-8'
        "
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="server-down-title"
          class="server-down-card text-fg"
          :class="
            isCompactShell
              ? 'server-down-card--compact flex min-h-[100dvh] w-full flex-col'
              : 'my-auto w-full max-w-2xl max-h-[min(92dvh,720px)] overflow-y-auto custom-scrollbar rounded-3xl border border-border p-5 sm:p-8'
          "
        >
          <div
            class="min-w-0"
            :class="
              isCompactShell
                ? 'server-down-card-body custom-scrollbar min-h-0 flex-1 overflow-y-auto'
                : ''
            "
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
                <circle
                  cx="12"
                  cy="16.5"
                  r="0.5"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </div>

            <h1
              id="server-down-title"
              class="text-xl font-extrabold tracking-tight sm:text-3xl"
            >
              Echo server is currently down
            </h1>
            <p class="mt-2 text-sm leading-relaxed text-fg-soft sm:text-base">
              We are retrying in real time and will reconnect automatically once
              service is healthy again.
            </p>

            <div
              class="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3"
            >
              <div class="rounded-2xl bg-glass-1 px-4 py-3">
                <p
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  Downtime
                </p>
                <p class="mt-1 text-base font-semibold tabular-nums text-fg">
                  {{ outageDurationLabel }}
                </p>
              </div>
              <div class="rounded-2xl bg-glass-1 px-4 py-3">
                <p
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  Last health check
                </p>
                <p class="mt-1 text-base font-semibold tabular-nums text-fg">
                  {{ checkedAgoLabel }}
                </p>
              </div>
              <div
                class="rounded-2xl bg-glass-1 px-4 py-3 min-[420px]:col-span-2 sm:col-span-1"
              >
                <p
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  {{ typicalRecoveryTitle }}
                </p>
                <p class="mt-1 text-base font-semibold tabular-nums text-fg">
                  {{ typicalRecoveryValue }}
                </p>
                <p class="mt-1 text-[11px] leading-snug text-fg-soft">
                  {{ typicalRecoveryHint }}
                </p>
              </div>
            </div>

            <div class="mt-5">
              <div
                class="server-down-recovery-track overflow-hidden rounded-full"
                role="progressbar"
                :aria-label="progressAriaLabel"
                :aria-valuemin="0"
                :aria-valuemax="100"
                :aria-valuenow="Math.round(recoveryProgressPercent)"
              >
                <div
                  class="server-down-recovery-bar h-1.5 rounded-full transition-[width] duration-1000 ease-linear"
                  :style="{ width: recoveryProgressPercent + '%' }"
                />
              </div>
              <p
                class="mt-2 text-center text-xs leading-relaxed tabular-nums text-fg-soft sm:text-left"
              >
                {{ recoveryTimerLine }}
              </p>
            </div>

            <p
              v-if="detail"
              class="server-down-detail mt-4 text-xs leading-relaxed text-fg-soft"
            >
              {{ detail }}
            </p>

            <div
              class="mt-6 flex items-center gap-2"
              :class="{ 'pb-1': isCompactShell }"
            >
              <span
                class="server-down-status-dot inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                :class="
                  checking
                    ? 'server-down-status-dot--checking animate-pulse'
                    : 'server-down-status-dot--waiting'
                "
                aria-hidden="true"
              />
              <span class="min-w-0 text-xs leading-snug text-fg-soft">
                {{
                  checking ? 'Checking server status…' : 'Waiting for recovery…'
                }}
              </span>
            </div>
          </div>

          <div
            class="server-down-card-actions flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap"
            :class="isCompactShell ? 'pt-4' : 'mt-5'"
          >
            <button
              type="button"
              class="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-glass-2 px-4 text-sm font-semibold text-fg transition-colors hover:bg-glass-hover sm:w-auto"
              @click="emit('retry')"
            >
              Check again now
            </button>
            <button
              type="button"
              class="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-contrast-fg transition-colors hover:brightness-105 sm:w-auto"
              @click="emit('refresh')"
            >
              Refresh app
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/*
 * Light-first: default rules use semantic tokens so default/light reads correctly
 * without extra selectors; dark theme is layered with :global(html[data-theme='dark']).
 */

/* --- Modal backdrop ----------------------------------------------------- */
.server-down-overlay {
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
}

:global(html[data-theme='dark']) .server-down-overlay {
  background: rgba(7, 5, 14, 0.78);
}

/* --- Compact (mobile/tablet) full-viewport panel ------------------------ */
.server-down-card--compact {
  box-sizing: border-box;
  max-height: none;
  border: none;
  border-radius: 0;
  padding: calc(env(safe-area-inset-top, 0px) + 1rem)
    max(1rem, env(safe-area-inset-right, 0px))
    calc(env(safe-area-inset-bottom, 0px) + 1rem)
    max(1rem, env(safe-area-inset-left, 0px));
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

/* Recovery progress ------------------------------------------------------ */
.server-down-recovery-track {
  background: color-mix(in srgb, var(--border) 35%, transparent);
}

.server-down-recovery-bar {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 88%, white 12%),
    color-mix(in srgb, var(--accent) 55%, rgb(244 63 94) 45%)
  );
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 35%, transparent);
}

:global(html[data-theme='dark']) .server-down-recovery-track {
  background: rgba(255, 255, 255, 0.08);
}

:global(html[data-theme='dark']) .server-down-recovery-bar {
  background: linear-gradient(90deg, rgb(167 139 250), rgb(244 114 182));
  box-shadow: 0 0 16px rgba(167, 139, 250, 0.35);
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
