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
  'open-channel': [payload: { channelId: string }];
}>();

const scrollerRef = ref<HTMLElement | null>(null);
const pauseCarousel = ref(false);
let advanceTimer: ReturnType<typeof setInterval> | null = null;
const slideIndex = ref(0);
const reducedMotion = ref(false);

const count = computed(() => props.events.length);
const layoutSingle = computed(() => count.value <= 1);

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
    })} – ${b.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } catch {
    return '';
  }
}

function scrollToIndex(i: number, smooth: boolean) {
  const root = scrollerRef.value;
  if (!root || count.value < 1) return;
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
  if (reducedMotion.value || count.value < 2) return;
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
  () => [props.serverId, props.events.map((e) => e.id).join(',')] as const,
  () => {
    slideIndex.value = 0;
    void nextTick(() => scrollToIndex(0, false));
    startAdvance();
  },
);

watch([count, reducedMotion], () => {
  void nextTick(() => scrollToIndex(0, false));
  startAdvance();
});

onMounted(() => {
  reducedMotion.value =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  void nextTick(() => scrollToIndex(0, false));
  startAdvance();
});

onBeforeUnmount(() => {
  stopAdvance();
});

function onRsvp(ev: EchoWorkspaceEventSummary, status: 'going' | 'declined') {
  emit('rsvp', { eventId: ev.id, status });
}

function onOpenChannel(ev: EchoWorkspaceEventSummary) {
  const cid = ev.channelId?.trim();
  if (cid) emit('open-channel', { channelId: cid });
}
</script>

<template>
  <section
    v-if="events.length > 0"
    class="server-events-carousel border-b border-border/80 px-2 pb-2 pt-1"
    aria-label="Upcoming server events"
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
        v-for="ev in events"
        :key="ev.id"
        data-event-slide
        class="server-events-carousel__slide flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-glass-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm"
        :class="[
          layoutSingle
            ? 'w-full shrink-0 snap-none'
            : 'w-[min(100%,22rem)] shrink-0 snap-start sm:w-[min(100%,26rem)]',
          ev.imageUrl?.trim()
            ? 'overflow-hidden p-0'
            : 'min-h-[88px] p-2.5',
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
            <p class="mt-0.5 text-[11px] leading-snug text-white/90 drop-shadow-sm">
              {{ formatRange(ev) }}
              <span v-if="ev.timezoneLabel" class="text-white/75">
                · {{ ev.timezoneLabel }}</span
              >
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
            <template v-if="ev.maxAttendees != null">
              · cap {{ ev.maxAttendees }}</template
            >
          </p>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-if="ev.channelId"
              type="button"
              class="rounded-lg border border-border bg-glass-2 px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
              @click="onOpenChannel(ev)"
            >
              Open channel
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
                <span v-if="ev.timezoneLabel" class="text-fg-soft">
                  · {{ ev.timezoneLabel }}</span
                >
              </p>
              <p class="mt-0.5 text-[11px] text-fg-soft">
                <span class="font-medium text-foreground">{{ ev.goingCount }}</span>
                going
                <template v-if="ev.maxAttendees != null">
                  · cap {{ ev.maxAttendees }}</template
                >
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-if="ev.channelId"
              type="button"
              class="rounded-lg border border-border bg-glass-2 px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
              @click="onOpenChannel(ev)"
            >
              Open channel
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
      v-if="!layoutSingle && events.length > 1"
      class="mt-1 flex justify-center gap-1"
      role="tablist"
      aria-label="Event slides"
    >
      <span
        v-for="(ev, i) in events"
        :key="`dot-${ev.id}`"
        class="h-1.5 w-1.5 rounded-full transition-colors"
        :class="i === slideIndex ? 'bg-accent' : 'bg-border'"
      />
    </div>
  </section>
</template>

<style scoped>
.server-events-carousel__scroller {
  -webkit-overflow-scrolling: touch;
}
</style>
