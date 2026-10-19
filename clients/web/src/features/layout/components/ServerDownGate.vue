<script setup lang="ts">
import { echoT } from '@/i18n';
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
  if (!props.outageSinceMs) return echoT('b32.sd.detecting');
  return formatDuration(nowMs.value - props.outageSinceMs);
});

/** Live-updating label for how long ago the last health check ran. */
const checkedAgoLabel = computed(() => {
  if (!props.lastCheckedAtMs) return echoT('b32.sd.checkingNow');
  return echoT('b32.sd.ago', {
    duration: formatDuration(nowMs.value - props.lastCheckedAtMs),
  });
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
  props.recoverySampleCount > 0
    ? echoT('b32.sd.avgRecovery')
    : echoT('b32.sd.typicalRecovery'),
);

const typicalRecoveryValue = computed(() =>
  formatDuration(estimateSeconds.value * 1000),
);

const typicalRecoveryHint = computed(() => {
  if (props.recoverySampleCount > 0) {
    return echoT(
      props.recoverySampleCount === 1
        ? 'b32.sd.basedOnOne'
        : 'b32.sd.basedOnMany',
      { count: props.recoverySampleCount },
    );
  }
  return echoT('b32.sd.defaultHint');
});

const recoveryTimerLine = computed(() => {
  if (!props.outageSinceMs) {
    return echoT('b32.sd.typicalWindow', {
      duration: formatDuration(estimateSeconds.value * 1000),
    });
  }
  const rem = recoveryRemainingSeconds.value;
  if (rem > 0) {
    return echoT('b32.sd.remaining', { rem, est: estimateSeconds.value });
  }
  return echoT('b32.sd.pastWindow');
});

const progressAriaLabel = computed(() =>
  echoT('b32.sd.progressAria', { est: estimateSeconds.value }),
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
              {{ echoT('b32.sd.title') }}
            </h1>
            <p class="mt-2 text-sm leading-relaxed text-fg-soft sm:text-base">
              {{ echoT('b32.sd.body') }}
            </p>

            <div
              class="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3"
            >
              <div class="rounded-2xl bg-glass-1 px-4 py-3">
                <p
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  {{ echoT('b32.sd.downtime') }}
                </p>
                <p class="mt-1 text-base font-semibold tabular-nums text-fg">
                  {{ outageDurationLabel }}
                </p>
              </div>
              <div class="rounded-2xl bg-glass-1 px-4 py-3">
                <p
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  {{ echoT('b32.sd.lastCheck') }}
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
                  checking
                    ? echoT('b32.sd.checkingStatus')
                    : echoT('b32.sd.waiting')
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
              {{ echoT('b32.sd.checkAgain') }}
            </button>
            <button
              type="button"
              class="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-contrast-fg transition-colors hover:brightness-105 sm:w-auto"
              @click="emit('refresh')"
            >
              {{ echoT('b32.sd.refresh') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles/ServerDownGate.scss"></style>
