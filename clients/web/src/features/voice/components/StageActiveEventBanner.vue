<script setup lang="ts">
import { computed } from 'vue';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import {
  formatStageEventCountdown,
  isStageEventLive,
} from '@/features/voice/stage/stageLobbyUtils';

const props = defineProps<{
  event: EchoWorkspaceEventSummary;
  nowMs: number;
  startedFromLobby?: boolean;
  promptYoutubeLive?: boolean;
  canManageYoutube?: boolean;
}>();

const emit = defineEmits<{
  dismiss: [];
  dismissYoutubePrompt: [];
}>();

const isLive = computed(() => isStageEventLive(props.event, props.nowMs));
const countdown = computed(() =>
  formatStageEventCountdown(props.event, props.nowMs),
);
</script>

<template>
  <div
    class="stage-event-banner flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center"
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
      <p
        class="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300/90"
      >
        {{
          startedFromLobby
            ? 'Event in progress'
            : isLive
              ? 'Scheduled event · live'
              : 'Scheduled event'
        }}
      </p>
      <p class="truncate text-sm font-semibold text-foreground">
        {{ event.title }}
      </p>
      <p class="text-xs text-muted">
        {{ countdown }} · {{ event.goingCount }} going
      </p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <p
        v-if="promptYoutubeLive && canManageYoutube"
        class="text-xs text-indigo-800 dark:text-indigo-100/90"
      >
        This event is tagged for YouTube live — use the controls above to go
        live.
      </p>
      <button
        v-if="promptYoutubeLive"
        type="button"
        class="rounded-lg border border-indigo-400/40 px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-500/15 dark:text-indigo-100"
        @click="emit('dismissYoutubePrompt')"
      >
        Dismiss tip
      </button>
      <button
        type="button"
        class="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-fg-soft hover:bg-glass-hover"
        @click="emit('dismiss')"
      >
        Dismiss
      </button>
    </div>
  </div>
</template>
