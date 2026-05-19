import { ref, computed, watch, onUnmounted } from 'vue';

export function useChatInputSlowmode(props: {
  slowmodeInterval?: number;
  lastOwnMessageAt?: string | null;
}) {
  const slowmodeInterval = computed(() => Number(props.slowmodeInterval || 0));
  const lastOwnMessageAt = computed(() =>
    props.lastOwnMessageAt ? String(props.lastOwnMessageAt) : null,
  );
  const nowTick = ref(Date.now());
  let slowmodeTimer: ReturnType<typeof setInterval> | null = null;

  function startSlowmodeTicker() {
    if (slowmodeTimer) return;
    slowmodeTimer = setInterval(() => {
      nowTick.value = Date.now();
    }, 1000);
  }

  function stopSlowmodeTicker() {
    if (!slowmodeTimer) return;
    clearInterval(slowmodeTimer);
    slowmodeTimer = null;
  }

  watch(
    [slowmodeInterval, lastOwnMessageAt],
    ([_i, _t]) => {
      if (slowmodeInterval.value > 0 && lastOwnMessageAt.value)
        startSlowmodeTicker();
      else stopSlowmodeTicker();
    },
    { immediate: true },
  );

  onUnmounted(() => stopSlowmodeTicker());

  const slowmodeActive = computed(() => {
    if (slowmodeInterval.value <= 0 || !lastOwnMessageAt.value) return false;
    const last = Number.isFinite(Number(lastOwnMessageAt.value))
      ? Number(lastOwnMessageAt.value)
      : Date.parse(lastOwnMessageAt.value);
    if (!Number.isFinite(last)) return false;
    const elapsed = Math.floor((nowTick.value - last) / 1000);
    const rem = Math.max(0, Math.ceil(slowmodeInterval.value - elapsed));
    return rem > 0;
  });

  const slowmodeRemainingSeconds = computed(() => {
    if (!lastOwnMessageAt.value) return 0;
    const last = Number.isFinite(Number(lastOwnMessageAt.value))
      ? Number(lastOwnMessageAt.value)
      : Date.parse(lastOwnMessageAt.value);
    if (!Number.isFinite(last)) return 0;
    const elapsed = Math.floor((nowTick.value - last) / 1000);
    return Math.max(0, Math.ceil(slowmodeInterval.value - elapsed));
  });

  const slowmodeProgressPercent = computed(() => {
    if (slowmodeInterval.value <= 0) return 0;
    const rem = slowmodeRemainingSeconds.value;
    const elapsed = Math.max(0, slowmodeInterval.value - rem);
    return Math.max(
      0,
      Math.min(100, Math.round((elapsed / slowmodeInterval.value) * 100)),
    );
  });

  return {
    slowmodeInterval,
    lastOwnMessageAt,
    slowmodeActive,
    slowmodeRemainingSeconds,
    slowmodeProgressPercent,
  };
}
