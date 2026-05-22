<script setup lang="ts">
import { computed } from 'vue';
import { withBasePath } from '@/features/layout/urlNavigation';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  formatStageEventCountdown,
  parsePlannedActivityKeyFromDescription,
} from '@/features/voice/stage/stageLobbyUtils';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

const appBase = import.meta.env.BASE_URL || '/';

const vcActivityArt = {
  youtube: withBasePath('/vc-activities/youtube-hero.svg', appBase),
  stage: withBasePath('/vc-activities/echoed-names-hero.svg', appBase),
} as const;

const props = defineProps<{
  channelName: string;
  planningEvent: EchoWorkspaceEventSummary | null;
  nowMs: number;
}>();

const emit = defineEmits<{
  startYoutube: [];
  startVoiceOnly: [];
  startPlannedEvent: [event: EchoWorkspaceEventSummary, activityKey: EchoVcActivityKey | null];
  openActivityPicker: [];
}>();

const plannedActivityKey = computed(() => {
  const ev = props.planningEvent;
  if (!ev?.description) return null;
  return parsePlannedActivityKeyFromDescription(ev.description);
});

const eventCountdown = computed(() => {
  const ev = props.planningEvent;
  if (!ev) return '';
  return formatStageEventCountdown(ev, props.nowMs);
});
</script>

<template>
  <div
    class="stage-vc-lobby custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#0b0a10] px-4 py-6 sm:px-8 sm:py-8"
  >
    <div class="mx-auto w-full max-w-3xl">
      <header class="mb-6 text-center sm:mb-8">
        <p
          class="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/80"
        >
          Stage
        </p>
        <h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {{ channelName }}
        </h1>
        <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Plan what happens next — pick an activity, start voice-only, or join a
          scheduled event before you go live.
        </p>
      </header>

      <section
        v-if="planningEvent"
        class="stage-vc-lobby__planned mb-6 overflow-hidden rounded-2xl border border-indigo-400/35 bg-gradient-to-br from-indigo-950/80 via-[#12101a] to-[#0b0a10] p-5 shadow-lg shadow-indigo-950/40 sm:p-6"
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
              class="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300/90"
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
            <p
              v-if="plannedActivityKey"
              class="mt-2 text-xs text-fg-soft"
            >
              Includes activity:
              <span class="font-semibold text-foreground">{{ plannedActivityKey }}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          class="mt-5 w-full rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-900/40 hover:bg-indigo-400 sm:w-auto"
          @click="
            emit('startPlannedEvent', planningEvent, plannedActivityKey)
          "
        >
          Start {{ planningEvent.title }}
        </button>
      </section>

      <div
        class="stage-vc-lobby__grid grid gap-3 sm:grid-cols-2"
        :class="planningEvent ? 'sm:grid-cols-2' : ''"
      >
        <button
          type="button"
          class="vc-act-widget group text-left vc-act-widget--youtube sm:col-span-2"
          aria-label="Start YouTube watch together"
          @click="emit('startYoutube')"
        >
          <div class="vc-act-widget__media">
            <img
              :src="vcActivityArt.youtube"
              alt=""
              class="vc-act-widget__img"
              loading="lazy"
            />
            <div class="vc-act-widget__media-scrim" aria-hidden="true" />
          </div>
          <div class="vc-act-widget__body">
            <div class="vc-act-widget__title-row">
              <span class="vc-act-widget__title">YouTube activity</span>
              <span class="vc-act-widget__cta" aria-hidden="true">Start</span>
            </div>
            <p class="vc-act-widget__desc">
              Shared queue with sync — great for stages before you stream out.
            </p>
          </div>
        </button>

        <button
          type="button"
          class="stage-vc-lobby__plain-card group flex flex-col rounded-2xl border border-border bg-glass-1 p-5 text-left transition hover:border-amber-500/35 hover:bg-glass-hover"
          @click="emit('startVoiceOnly')"
        >
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-200"
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
          <h3 class="text-base font-bold text-foreground">Voice only</h3>
          <p class="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
            Open the stage with speakers and audience — no activity panel.
          </p>
          <span
            class="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle group-hover:text-foreground"
            >Enter stage</span
          >
        </button>

        <button
          type="button"
          class="stage-vc-lobby__plain-card group flex flex-col rounded-2xl border border-border bg-glass-1 p-5 text-left transition hover:border-accent/40 hover:bg-glass-hover"
          @click="emit('openActivityPicker')"
        >
          <div
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15"
            aria-hidden="true"
          >
            <img :src="vcActivityArt.stage" alt="" class="h-7 w-7 opacity-90" />
          </div>
          <h3 class="text-base font-bold text-foreground">More activities</h3>
          <p class="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
            Wordle, games, and the full activity library — same as voice channels.
          </p>
          <span
            class="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle group-hover:text-foreground"
            >Browse library</span
          >
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-vc-lobby__plain-card {
  min-height: 11rem;
}
</style>
