import { onUnmounted, ref, watch, type Ref } from 'vue';
import { API_BASE } from '@/config';

const RUNTIME_STATS_URL = `${API_BASE}/api/v1/health/runtime-stats`;
const POLL_MS = 12_000;

export type ChannelPanelServerRuntimeStatsPayload = {
  timestamp: string;
  uptimeSec: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes?: number;
  arrayBuffersBytes?: number;
  loadAvg: number[] | null;
  freememBytes: number;
  totalmemBytes: number;
};

export function useChannelPanelServerRuntimeStats(enabled: Ref<boolean>) {
  const snapshot = ref<ChannelPanelServerRuntimeStatsPayload | null>(null);
  const fetchError = ref<string | null>(null);
  /** True after a 404 from the API (stats not enabled on server). */
  const serverStatsDisabled = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function clearTimer() {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function pull() {
    if (!enabled.value) return;
    try {
      const res = await fetch(RUNTIME_STATS_URL, {
        credentials: 'same-origin',
      });
      if (res.status === 404) {
        serverStatsDisabled.value = true;
        snapshot.value = null;
        fetchError.value = null;
        return;
      }
      if (!res.ok) {
        fetchError.value = `HTTP ${res.status}`;
        return;
      }
      serverStatsDisabled.value = false;
      fetchError.value = null;
      snapshot.value =
        (await res.json()) as ChannelPanelServerRuntimeStatsPayload;
    } catch (e) {
      fetchError.value =
        e instanceof Error ? e.message : 'Failed to load runtime stats';
    }
  }

  function armPolling() {
    clearTimer();
    if (!enabled.value) return;
    void pull();
    timer = setInterval(() => {
      void pull();
    }, POLL_MS);
  }

  watch(
    enabled,
    (on) => {
      if (!on) {
        clearTimer();
        snapshot.value = null;
        fetchError.value = null;
        serverStatsDisabled.value = false;
        return;
      }
      serverStatsDisabled.value = false;
      armPolling();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    clearTimer();
  });

  return {
    snapshot,
    fetchError,
    serverStatsDisabled,
    refresh: pull,
  };
}
