<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  deployCountdownActive,
  clearDeployCountdown,
} from '@/utils/deployCountdownOverlay';

const remainSeconds = ref(0);
let tick: ReturnType<typeof setInterval> | null = null;

function syncRemain() {
  const a = deployCountdownActive.value;
  if (!a) {
    remainSeconds.value = 0;
    return;
  }
  const ms = a.endsAt - Date.now();
  remainSeconds.value = Math.max(0, Math.ceil(ms / 1000));
}

watch(
  deployCountdownActive,
  (a) => {
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
    if (!a) return;
    syncRemain();
    tick = setInterval(syncRemain, 250);
  },
  { immediate: true },
);

onUnmounted(() => {
  if (tick) clearInterval(tick);
});

const showPostCutover = computed(
  () => !!deployCountdownActive.value && remainSeconds.value <= 0,
);

const title = computed(() =>
  showPostCutover.value ? 'Update in progress' : 'Restarting soon',
);

const subtitle = computed(() => deployCountdownActive.value?.message ?? '');
</script>

<template>
  <Teleport to="body">
    <div
      v-if="deployCountdownActive"
      class="deploy-countdown-overlay fixed inset-0 z-[400] flex flex-col items-center justify-center gap-4 px-6 py-10 text-center text-white"
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-labelledby="deploy-countdown-title"
      aria-describedby="deploy-countdown-desc"
    >
      <div
        class="pointer-events-none absolute inset-0 bg-[rgba(6,8,14,0.88)] backdrop-blur-md"
        aria-hidden="true"
      />
      <div
        class="relative z-[1] w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--echo-modal-bg,#12141a)] p-6 shadow-2xl"
      >
        <h2
          id="deploy-countdown-title"
          class="text-lg font-semibold tracking-tight text-white"
        >
          {{ title }}
        </h2>
        <p
          id="deploy-countdown-desc"
          class="mt-2 text-sm leading-relaxed text-fg-soft"
        >
          {{ subtitle }}
        </p>
        <div
          v-if="!showPostCutover"
          class="mt-5 text-5xl font-bold tabular-nums text-white"
          aria-label="Seconds until restart"
        >
          {{ remainSeconds }}
        </div>
        <p v-else class="mt-4 text-sm text-fg-subtle">
          Reconnecting automatically when the server is back…
        </p>
        <button
          v-if="showPostCutover"
          type="button"
          class="mt-5 w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          @click="clearDeployCountdown()"
        >
          Dismiss
        </button>
      </div>
    </div>
  </Teleport>
</template>
