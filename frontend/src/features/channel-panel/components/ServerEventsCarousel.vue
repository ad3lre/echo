<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import { safeImageUrl } from '@/utils/safeImageUrl';

const props = defineProps<{
  serverId: string;
  events: EchoWorkspaceEventSummary[];
}>();

const emit = defineEmits<{
  rsvp: [payload: { eventId: string; status: 'going' | 'declined' }];
  'open-channel': [
    payload: {
      eventId: string;
      channelId?: string | null;
      customLocation?: string | null;
    },
  ];
}>();

/** Hide events the user explicitly declined; keep “going” + “needs RSVP”. */
const visibleEvents = computed(() =>
  props.events.filter((e) => e.userRsvp !== 'declined'),
);

const goingEvents = computed(() =>
  visibleEvents.value.filter((e) => e.userRsvp === 'going'),
);

const pendingRsvpEvents = computed(() =>
  visibleEvents.value.filter((e) => e.userRsvp == null),
);

const scrollerRef = ref<HTMLElement | null>(null);
const pauseCarousel = ref(false);
let advanceTimer: ReturnType<typeof setInterval> | null = null;
const slideIndex = ref(0);
const reducedMotion = ref(false);

const carouselCount = computed(() => pendingRsvpEvents.value.length);
const layoutSingle = computed(() => carouselCount.value <= 1);

const nowMs = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function syncCountdownTimer() {
  if (visibleEvents.value.length > 0) {
    if (countdownTimer == null) {
      countdownTimer = setInterval(() => {
        nowMs.value = Date.now();
      }, 1000);
    }
  } else if (countdownTimer != null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

watch(
  () => visibleEvents.value.length,
  () => {
    syncCountdownTimer();
  },
);

function formatRange(ev: EchoWorkspaceEventSummary): string {
  try {
    const a = new Date(ev.startsAt);
    const b = new Date(ev.endsAt);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
    return `${a.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })} – ${b.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })}`;
  } catch {
    return '';
  }
}

function formatExactStart(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function countdownLabel(startsAtIso: string): string {
  const t = new Date(startsAtIso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = t - nowMs.value;
  if (diff <= 0) return 'Started';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `Starts in ${d}d ${h}h`;
  if (h > 0) return `Starts in ${h}h ${m}m`;
  if (m > 0) return `Starts in ${m}m ${s}s`;
  return 'Starting in moments';
}

function isEventLive(ev: EchoWorkspaceEventSummary): boolean {
  const a = new Date(ev.startsAt).getTime();
  const b = new Date(ev.endsAt).getTime();
  const n = nowMs.value;
  return !Number.isNaN(a) && !Number.isNaN(b) && n >= a && n <= b;
}

function hasEventLocation(ev: EchoWorkspaceEventSummary): boolean {
  return !!(ev.channelId?.trim() || ev.customLocation?.trim());
}

function locationCtaLabel(ev: EchoWorkspaceEventSummary): string {
  const live = isEventLive(ev);
  const customOnly = !ev.channelId?.trim() && !!ev.customLocation?.trim();
  if (live) return customOnly ? 'Check it out' : 'Go there';
  return customOnly ? 'Details' : 'Open channel';
}

function scrollToIndex(i: number, smooth: boolean) {
  const root = scrollerRef.value;
  if (!root || carouselCount.value < 1) return;
  const slides = root.querySelectorAll<HTMLElement>('[data-event-slide]');
  if (!slides.length) return;
  const idx = ((i % slides.length) + slides.length) % slides.length;
  const el = slides[idx];
  if (!el) return;
  el.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto',
    block: 'nearest',
    inline: 'start',
  });
  slideIndex.value = idx;
}

function stopAdvance() {
  if (advanceTimer) {
    clearInterval(advanceTimer);
    advanceTimer = null;
  }
}

function startAdvance() {
  stopAdvance();
  if (reducedMotion.value || carouselCount.value < 2) return;
  advanceTimer = setInterval(() => {
    if (pauseCarousel.value) return;
    scrollToIndex(slideIndex.value + 1, true);
  }, 10_000);
}

function onScrollSnap() {
  const root = scrollerRef.value;
  if (!root) return;
  const slides = root.querySelectorAll<HTMLElement>('[data-event-slide]');
  if (!slides.length) return;
  const rootRect = root.getBoundingClientRect();
  const mid = rootRect.left + rootRect.width * 0.25;
  let best = 0;
  let bestD = Infinity;
  slides.forEach((el, idx) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.left - mid);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  });
  slideIndex.value = best;
}

watch(
  () =>
    [
      props.serverId,
      pendingRsvpEvents.value.map((e) => e.id).join(','),
    ] as const,
  () => {
    slideIndex.value = 0;
    void nextTick(() => scrollToIndex(0, false));
    startAdvance();
  },
);

watch([carouselCount, reducedMotion], () => {
  void nextTick(() => scrollToIndex(0, false));
  startAdvance();
});

onMounted(() => {
  reducedMotion.value =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  void nextTick(() => scrollToIndex(0, false));
  startAdvance();
  syncCountdownTimer();
});

onBeforeUnmount(() => {
  stopAdvance();
  if (countdownTimer != null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

function onRsvp(ev: EchoWorkspaceEventSummary, status: 'going' | 'declined') {
  emit('rsvp', { eventId: ev.id, status });
}

function onOpenChannel(ev: EchoWorkspaceEventSummary) {
  emit('open-channel', {
    eventId: ev.id,
    channelId: ev.channelId?.trim() || null,
    customLocation: ev.customLocation?.trim() || null,
  });
}

const hasAny = computed(
  () => goingEvents.value.length > 0 || pendingRsvpEvents.value.length > 0,
);
</script>

<template>
  <section
    v-if="hasAny"
    class="server-events-root border-b border-border/80 px-2 pb-2 pt-1"
    aria-label="Upcoming server events"
  >
    <!-- Answered “going”: compact, static strip (no snap carousel / auto-advance). -->
    <div v-if="goingEvents.length" class="mb-2 space-y-1.5">
      <div
        v-for="ev in goingEvents"
        :key="`going-${ev.id}`"
        class="flex min-h-0 items-stretch gap-2 rounded-lg border border-border/70 bg-glass-1/90 pl-2 pr-2 py-1.5 shadow-[inset_3px_0_0_rgba(99,102,241,0.45)]"
      >
        <div
          class="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/60 bg-surface/80"
          aria-hidden="true"
        >
          <img
            v-if="ev.imageUrl?.trim()"
            :src="safeImageUrl(ev.imageUrl.trim())"
            alt=""
            class="h-full w-full object-cover opacity-90"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/25 to-glass-3 text-[10px] font-bold text-fg-soft"
          >
            {{ ev.title.trim().slice(0, 1).toUpperCase() || '·' }}
          </div>
        </div>
        <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 leading-tight">
          <p class="truncate text-[12px] font-semibold text-foreground">
            {{ ev.title }}
          </p>
          <p class="text-[11px] font-medium text-accent">
            {{ countdownLabel(ev.startsAt) }}
          </p>
          <p class="truncate text-[10px] text-fg-subtle">
            {{ formatExactStart(ev.startsAt) }}
          </p>
          <button
            v-if="hasEventLocation(ev)"
            type="button"
            class="mt-0.5 w-fit rounded border border-border/80 bg-transparent px-1.5 py-0.5 text-[10px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
            @click="onOpenChannel(ev)"
          >
            {{ locationCtaLabel(ev) }}
          </button>
        </div>
      </div>
    </div>

    <!-- Still need RSVP: horizontal carousel (snap + auto-advance). -->
    <div
      v-if="pendingRsvpEvents.length"
      class="server-events-carousel"
      @pointerenter="pauseCarousel = true"
      @pointerleave="pauseCarousel = false"
      @focusin="pauseCarousel = true"
      @focusout="pauseCarousel = false"
    >
      <div
        ref="scrollerRef"
        class="server-events-carousel__scroller flex touch-pan-x gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,140,0.35)_transparent]"
        :class="
          layoutSingle
            ? 'flex-col'
            : 'snap-x snap-mandatory flex-row flex-nowrap'
        "
        @scroll.passive="onScrollSnap"
      >
        <article
          v-for="ev in pendingRsvpEvents"
          :key="ev.id"
          data-event-slide
          class="server-events-carousel__slide flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-glass-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm"
          :class="[
            layoutSingle
              ? 'w-full shrink-0 snap-none'
              : 'w-[min(100%,22rem)] shrink-0 snap-start sm:w-[min(100%,26rem)]',
            ev.imageUrl?.trim() ? 'overflow-hidden p-0' : 'min-h-[88px] p-2.5',
          ]"
        >
          <div
            v-if="ev.imageUrl?.trim()"
            class="relative w-full shrink-0 overflow-hidden border-b border-border/80 bg-surface aspect-[16/9] max-h-[140px]"
          >
            <img
              :src="safeImageUrl(ev.imageUrl.trim())"
              alt=""
              class="h-full w-full object-cover"
            />
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute bottom-0 left-0 right-0 px-2.5 pb-2 pt-6"
            >
              <p
                class="truncate text-[13px] font-semibold leading-tight text-white drop-shadow-sm"
              >
                {{ ev.title }}
              </p>
              <p
                class="mt-0.5 text-[11px] leading-snug text-white/90 drop-shadow-sm"
              >
                {{ formatRange(ev) }}
              </p>
            </div>
          </div>
          <div
            v-if="ev.imageUrl?.trim()"
            class="flex flex-col gap-2 px-2.5 pb-2.5 pt-1"
          >
            <p class="text-[11px] text-fg-soft">
              <span class="font-medium text-foreground">{{ ev.goingCount }}</span>
              going
            </p>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-if="hasEventLocation(ev)"
                type="button"
                class="rounded-lg border border-border bg-glass-2 px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
                @click="onOpenChannel(ev)"
              >
                {{ locationCtaLabel(ev) }}
              </button>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors"
                :class="
                  ev.userRsvp === 'going'
                    ? 'bg-emerald-600/90 text-white'
                    : 'border border-border bg-glass-2 text-fg-soft hover:bg-glass-hover'
                "
                @click="onRsvp(ev, 'going')"
              >
                Going
              </button>
              <button
                type="button"
                class="rounded-lg border border-border bg-glass-2 px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
                :class="ev.userRsvp === 'declined' ? 'ring-1 ring-accent/40' : ''"
                @click="onRsvp(ev, 'declined')"
              >
                Not going
              </button>
            </div>
          </div>
          <template v-else>
            <div class="flex min-w-0 gap-2">
              <div class="min-w-0 flex-1">
                <p
                  class="truncate text-[13px] font-semibold leading-tight text-foreground"
                >
                  {{ ev.title }}
                </p>
                <p class="mt-0.5 text-[11px] leading-snug text-fg-subtle">
                  {{ formatRange(ev) }}
                </p>
                <p class="mt-0.5 text-[11px] text-fg-soft">
                  <span class="font-medium text-foreground">{{
                    ev.goingCount
                  }}</span>
                  going
                </p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-if="hasEventLocation(ev)"
                type="button"
                class="rounded-lg border border-border bg-glass-2 px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
                @click="onOpenChannel(ev)"
              >
                {{ locationCtaLabel(ev) }}
              </button>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors"
                :class="
                  ev.userRsvp === 'going'
                    ? 'bg-emerald-600/90 text-white'
                    : 'border border-border bg-glass-2 text-fg-soft hover:bg-glass-hover'
                "
                @click="onRsvp(ev, 'going')"
              >
                Going
              </button>
              <button
                type="button"
                class="rounded-lg border border-border bg-glass-2 px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
                :class="ev.userRsvp === 'declined' ? 'ring-1 ring-accent/40' : ''"
                @click="onRsvp(ev, 'declined')"
              >
                Not going
              </button>
            </div>
          </template>
        </article>
      </div>
      <div
        v-if="!layoutSingle && pendingRsvpEvents.length > 1"
        class="mt-1 flex justify-center gap-1"
        role="tablist"
        aria-label="Event slides"
      >
        <span
          v-for="(ev, i) in pendingRsvpEvents"
          :key="`dot-${ev.id}`"
          class="h-1.5 w-1.5 rounded-full transition-colors"
          :class="i === slideIndex ? 'bg-accent' : 'bg-border'"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.server-events-carousel__scroller {
  -webkit-overflow-scrolling: touch;
}
</style>
