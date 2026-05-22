<script setup lang="ts">
import { computed } from 'vue';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  formatStageEventCountdown,
  isStageEventLive,
} from '@/features/voice/stage/stageLobbyUtils';

const props = defineProps<{
  event: EchoWorkspaceEventSummary;
  nowMs: number;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

const isLive = computed(() => isStageEventLive(props.event, props.nowMs));
const countdown = computed(() =>
  formatStageEventCountdown(props.event, props.nowMs),
);
</script>

<template>
  <div
    class="stage-event-banner flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5"
  >
    <div
      v-if="event.imageUrl?.trim()"
      class="h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-border/80"
    >
      <img
        :src="safeImageUrl(event.imageUrl.trim())"
        alt=""
        class="h-full w-full object-cover"
      />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/90">
        {{ isLive ? 'Scheduled event · live' : 'Scheduled event' }}
      </p>
      <p class="truncate text-sm font-semibold text-foreground">
        {{ event.title }}
      </p>
      <p class="text-xs text-muted">{{ countdown }} · {{ event.goingCount }} going</p>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-fg-soft hover:bg-glass-hover"
      @click="emit('dismiss')"
    >
      Dismiss
    </button>
  </div>
</template>
