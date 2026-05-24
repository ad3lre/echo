<script setup lang="ts">
import { computed } from 'vue';
import { withBasePath } from '@/features/layout/urlNavigation';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import { safeImageUrl } from '@/utils/safeImageUrl';
import StageYoutubeGoLiveControls from '@/features/voice/components/StageYoutubeGoLiveControls.vue';
import {
  formatStageEventCountdown,
  formatStageModeLabel,
  listUpcomingStageEvents,
  parseStageModeFromDescription,
} from '@/features/voice/stage/stageLobbyUtils';

const appBase = import.meta.env.BASE_URL || '/';

const vcActivityArt = {
  youtube: withBasePath('/vc-activities/youtube-hero.svg', appBase),
} as const;

const props = defineProps<{
  channelName: string;
  stageChannelId: string;
  echoServerId: string;
  canManageStage: boolean;
  planningEvent: EchoWorkspaceEventSummary | null;
  upcomingEvents: readonly EchoWorkspaceEventSummary[];
  nowMs: number;
}>();

const emit = defineEmits<{
  startVoiceOnly: [];
  startPlannedEvent: [event: EchoWorkspaceEventSummary];
  scheduleEvent: [];
  youtubeLiveStarted: [];
}>();

const plannedStageMode = computed(() => {
  const ev = props.planningEvent;
  if (!ev?.description) return null;
  return parseStageModeFromDescription(ev.description);
});

const plannedModeLabel = computed(() => {
  const mode = plannedStageMode.value;
  return mode ? formatStageModeLabel(mode) : '';
});

const eventCountdown = computed(() => {
  const ev = props.planningEvent;
  if (!ev) return '';
  return formatStageEventCountdown(ev, props.nowMs);
});

const otherUpcomingEvents = computed(() => {
  const all = listUpcomingStageEvents(
    props.upcomingEvents,
    props.stageChannelId,
    props.nowMs,
  );
  const planningId = props.planningEvent?.id;
  return planningId ? all.filter((ev) => ev.id !== planningId) : all;
});
</script>

<template>
  <div
    class="stage-vc-lobby custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)] px-4 py-6 sm:px-8 sm:py-8"
  >
    <div class="mx-auto w-full max-w-3xl">
      <header class="mb-6 text-center sm:mb-8">
        <p
          class="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-200/80"
        >
          Stage
        </p>
        <h1
          class="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          {{ channelName }}
        </h1>
        <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Start a scheduled event, go live on YouTube, or enter the stage with
          voice only.
        </p>
      </header>

      <section
        v-if="planningEvent"
        class="stage-vc-lobby__planned mb-6 overflow-hidden rounded-2xl border border-indigo-400/35 bg-gradient-to-br from-indigo-100 via-[var(--elevated)] to-[var(--bg)] p-5 shadow-lg shadow-indigo-950/10 dark:from-indigo-950/80 dark:via-[#12101a] dark:to-[#0b0a10] dark:shadow-indigo-950/40 sm:p-6"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            v-if="planningEvent.imageUrl?.trim()"
            class="h-24 w-full shrink-0 overflow-hidden rounded-xl border border-border/60 sm:h-28 sm:w-40"
          >
            <img
              :src="safeImageUrl(planningEvent.imageUrl.trim())"
              alt=""
              class="h-full w-full object-cover"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p
              class="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300/90"
            >
              Starting within the hour
            </p>
            <h2 class="mt-1 text-xl font-bold text-foreground">
              {{ planningEvent.title }}
            </h2>
            <p class="mt-2 text-sm text-muted">
              {{ eventCountdown }} · {{ planningEvent.goingCount }}
              {{ planningEvent.goingCount === 1 ? 'person' : 'people' }} going
            </p>
            <p v-if="plannedModeLabel" class="mt-2 text-xs text-fg-soft">
              Planned format:
              <span class="font-semibold text-foreground">{{
                plannedModeLabel
              }}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          class="mt-5 w-full rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-900/40 hover:bg-indigo-400 sm:w-auto"
          @click="emit('startPlannedEvent', planningEvent)"
        >
          Start event
        </button>
      </section>

      <section
        class="stage-vc-lobby__youtube mb-6 overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-100 via-[var(--elevated)] to-[var(--bg)] p-5 dark:from-red-950/40 dark:via-[#12101a] dark:to-[#0b0a10] sm:p-6"
      >
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div
            class="h-20 w-full shrink-0 overflow-hidden rounded-xl border border-border/60 sm:h-24 sm:w-36"
          >
            <img
              :src="vcActivityArt.youtube"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-bold text-foreground">
              Go live on YouTube
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-muted">
              Stream the stage program feed to YouTube Live. Connect YouTube in
              Settings before you start.
            </p>
          </div>
        </div>
        <StageYoutubeGoLiveControls
          :echo-server-id="echoServerId"
          :stage-channel-id="stageChannelId"
          :can-manage="canManageStage"
          compact
          @live-started="emit('youtubeLiveStarted')"
        />
      </section>

      <div class="stage-vc-lobby__grid grid gap-3 sm:grid-cols-2">
        <button
          v-if="canManageStage"
          type="button"
          class="stage-vc-lobby__plain-card group flex flex-col rounded-2xl border border-border bg-glass-1 p-5 text-left transition hover:border-indigo-500/35 hover:bg-glass-hover"
          @click="emit('scheduleEvent')"
        >
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
            aria-hidden="true"
          >
            <svg
              class="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 class="text-base font-bold text-foreground">Schedule event</h3>
          <p class="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
            Create a scheduled stage event with RSVPs for this channel.
          </p>
          <span
            class="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle group-hover:text-foreground"
            >New event</span
          >
        </button>

        <button
          type="button"
          class="stage-vc-lobby__plain-card group flex flex-col rounded-2xl border border-border bg-glass-1 p-5 text-left transition hover:border-amber-500/35 hover:bg-glass-hover"
          :class="canManageStage ? '' : 'sm:col-span-2'"
          @click="emit('startVoiceOnly')"
        >
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-200"
            aria-hidden="true"
          >
            <svg
              class="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <h3 class="text-base font-bold text-foreground">Enter stage</h3>
          <p class="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
            Open the stage with speakers and audience — no stream or event
            setup.
          </p>
          <span
            class="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle group-hover:text-foreground"
            >Voice only</span
          >
        </button>
      </div>

      <section
        v-if="otherUpcomingEvents.length > 0"
        class="mt-6 rounded-2xl border border-border bg-glass-1 p-4 sm:p-5"
      >
        <h3 class="text-sm font-bold text-foreground">
          Upcoming on this stage
        </h3>
        <ul class="mt-3 space-y-2">
          <li
            v-for="ev in otherUpcomingEvents.slice(0, 4)"
            :key="ev.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-bg/40 px-3 py-2 text-sm"
          >
            <span class="min-w-0 truncate font-medium text-foreground">{{
              ev.title
            }}</span>
            <span class="shrink-0 text-xs text-muted">{{
              formatStageEventCountdown(ev, nowMs)
            }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.stage-vc-lobby__plain-card {
  min-height: 11rem;
}
</style>
