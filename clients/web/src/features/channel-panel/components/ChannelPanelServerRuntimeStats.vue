<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/features/dev/devSettings';
import {
  useChannelPanelServerRuntimeStats,
  type ChannelPanelServerRuntimeStatsPayload,
} from '@/features/channel-panel/composables/useChannelPanelServerRuntimeStats';

const devSettings = useDevSettingsStore();
const { channelPanelServerRuntimeStatsEnabled } = storeToRefs(devSettings);

const { snapshot, fetchError, serverStatsDisabled } =
  useChannelPanelServerRuntimeStats(channelPanelServerRuntimeStatsEnabled);

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

function formatUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLoad(load: number[] | null): string {
  if (!load || load.length === 0) return '—';
  return load.map((x) => x.toFixed(2)).join(' / ');
}

function memUseLine(s: ChannelPanelServerRuntimeStatsPayload): string {
  const heapPct =
    s.heapTotalBytes > 0
      ? Math.round((100 * s.heapUsedBytes) / s.heapTotalBytes)
      : 0;
  const hostPct =
    s.totalmemBytes > 0
      ? Math.round((100 * (s.totalmemBytes - s.freememBytes)) / s.totalmemBytes)
      : 0;
  return `RSS ${formatBytes(s.rssBytes)} · heap ${heapPct}% · host ${hostPct}% used`;
}

const primaryLine = computed(() => {
  const s = snapshot.value;
  if (!s) return null;
  return `Up ${formatUptime(s.uptimeSec)} · load ${formatLoad(s.loadAvg)}`;
});

const secondaryLine = computed(() => {
  const s = snapshot.value;
  if (!s) return null;
  return memUseLine(s);
});
</script>

<template>
  <div
    v-if="channelPanelServerRuntimeStatsEnabled"
    class="channel-panel-server-runtime-stats shrink-0 border-b border-border px-3 py-2"
    role="region"
    aria-label="Echo API runtime stats"
  >
    <div
      class="text-[0.65rem] font-semibold uppercase tracking-wide text-fg-soft"
    >
      API server
    </div>
    <div
      v-if="serverStatsDisabled"
      class="mt-1 text-xs leading-snug text-fg-soft"
    >
      Runtime stats are off on this API. Set
      <span class="font-mono text-[0.7rem]">ECHO_PUBLIC_RUNTIME_STATS=1</span>
      on the server, then reload.
    </div>
    <div
      v-else-if="fetchError"
      class="mt-1 text-xs leading-snug text-[color:var(--set-negative-label-fg)]"
    >
      {{ fetchError }}
    </div>
    <template v-else-if="snapshot">
      <div
        class="mt-1 font-mono text-[0.7rem] leading-snug tabular-nums text-foreground"
      >
        {{ primaryLine }}
      </div>
      <div
        class="mt-0.5 font-mono text-[0.65rem] leading-snug tabular-nums text-fg-soft"
      >
        {{ secondaryLine }}
      </div>
    </template>
    <div v-else class="mt-1 text-xs text-fg-soft">Loading…</div>
  </div>
</template>
