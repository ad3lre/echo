<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type { EventDetailView } from '@/features/server-events/eventDetailView';

const props = defineProps<{
  modelValue: boolean;
  event: EventDetailView | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  rsvp: [payload: { status: 'going' | 'declined' }];
  'open-location': [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

function close() {
  emit('update:modelValue', false);
}

const ev = computed(() => props.event);

const hasLocation = computed(
  () => !!(ev.value?.channelId || ev.value?.customLocation),
);

const locationKind = computed<'channel' | 'custom' | 'none'>(() => {
  if (ev.value?.channelId) return 'channel';
  if (ev.value?.customLocation) return 'custom';
  return 'none';
});

const locationLabel = computed(() => {
  const e = ev.value;
  if (!e) return '';
  if (e.channelId) return e.channelName ? `#${e.channelName}` : 'Linked channel';
  if (e.customLocation) return e.customLocation;
  return 'No location set';
});

const openLocationLabel = computed(() =>
  locationKind.value === 'channel' ? 'Open channel' : 'Open location',
);

function formatDateRange(): string {
  const e = ev.value;
  if (!e) return '';
  try {
    const a = new Date(e.startsAt);
    if (Number.isNaN(a.getTime())) return '';
    const startStr = a.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    if (!e.endsAt) return startStr;
    const b = new Date(e.endsAt);
    if (Number.isNaN(b.getTime())) return startStr;
    const sameDay = a.toDateString() === b.toDateString();
    const endStr = b.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const endFull = b.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${startStr} – ${sameDay ? endStr : endFull}`;
  } catch {
    return '';
  }
}

const dateRange = computed(formatDateRange);

const goingSummary = computed(() => {
  const e = ev.value;
  if (!e) return '';
  const base = `${e.goingCount} ${e.goingCount === 1 ? 'person' : 'people'} going`;
  return e.maxAttendees ? `${base} · ${e.maxAttendees} max` : base;
});

function onRsvp(status: 'going' | 'declined') {
  emit('rsvp', { status });
}

function onOpenLocation() {
  emit('open-location');
}
</script>

<template>
  <div
    v-if="modelValue && ev"
    class="fixed inset-0 z-[160] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
      class="event-detail-modal real-glass-modal relative w-full max-w-lg overflow-hidden rounded-2xl text-foreground bg-transparent"
    >
      <button
        type="button"
        class="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
        aria-label="Close"
        @click="close"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            d="M6 6l12 12M18 6L6 18"
          />
        </svg>
      </button>

      <!-- Hero -->
      <div
        v-if="ev.imageUrl"
        class="relative aspect-[16/9] max-h-[220px] w-full overflow-hidden border-b border-border/80 bg-surface"
      >
        <img
          :src="safeImageUrl(ev.imageUrl)"
          alt=""
          class="h-full w-full object-cover"
        />
        <div
          class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"
          aria-hidden="true"
        />
        <div class="absolute inset-x-0 bottom-0 px-4 pb-3 pt-8">
          <h2
            id="event-detail-title"
            class="text-lg font-bold leading-tight text-white drop-shadow-sm"
          >
            {{ ev.title }}
          </h2>
        </div>
      </div>

      <div class="relative max-h-[70vh] overflow-y-auto px-4 py-4">
        <h2
          v-if="!ev.imageUrl"
          id="event-detail-title"
          class="pr-8 text-lg font-bold leading-tight text-foreground"
        >
          {{ ev.title }}
        </h2>

        <!-- Server line -->
        <div
          v-if="ev.serverName"
          class="mt-1 flex items-center gap-2 text-[12px] text-fg-soft"
        >
          <div
            class="h-5 w-5 shrink-0 overflow-hidden rounded-md border border-border/70 bg-surface"
          >
            <PausedGifAvatar
              :src="serverGuildIconDisplayUrl(ev.serverImageUrl ?? '')"
              :alt="ev.serverName"
              :session-key="ev.serverId"
              img-class="h-full w-full object-cover"
            />
          </div>
          <span class="truncate font-medium text-foreground">{{
            ev.serverName
          }}</span>
        </div>

        <!-- When -->
        <div class="mt-3 flex items-start gap-2">
          <svg
            viewBox="0 0 24 24"
            class="mt-0.5 h-4 w-4 shrink-0 text-accent"
            aria-hidden="true"
          >
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z"
            />
          </svg>
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-foreground">
              {{ dateRange }}
            </p>
            <p v-if="ev.timezoneLabel" class="text-[11px] text-fg-subtle">
              {{ ev.timezoneLabel }}
            </p>
          </div>
        </div>

        <!-- Where -->
        <div class="mt-3 flex items-start gap-2">
          <svg
            viewBox="0 0 24 24"
            class="mt-0.5 h-4 w-4 shrink-0 text-accent"
            aria-hidden="true"
          >
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z"
            />
            <circle
              cx="12"
              cy="10"
              r="2.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            />
          </svg>
          <p class="min-w-0 break-words text-[13px] text-fg-soft">
            {{ locationLabel }}
          </p>
        </div>

        <!-- Going -->
        <p class="mt-3 text-[12px] text-fg-soft">
          <span class="font-semibold text-foreground">{{ ev.goingCount }}</span>
          {{ ev.goingCount === 1 ? 'person' : 'people' }} going<template
            v-if="ev.maxAttendees"
          >
            · {{ ev.maxAttendees }} max</template
          >
        </p>

        <!-- Description -->
        <p
          v-if="ev.description.trim()"
          class="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-soft"
        >
          {{ ev.description }}
        </p>

        <!-- Actions -->
        <div
          class="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4"
        >
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            :class="
              ev.userRsvp === 'going'
                ? 'bg-emerald-600/90 text-white'
                : 'border border-border bg-glass-2 text-fg-soft hover:bg-glass-hover hover:text-foreground'
            "
            @click="onRsvp('going')"
          >
            {{ ev.userRsvp === 'going' ? "You're going" : 'Going' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-border bg-glass-2 px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
            :class="ev.userRsvp === 'declined' ? 'ring-1 ring-accent/40' : ''"
            @click="onRsvp('declined')"
          >
            Not going
          </button>
          <button
            v-if="hasLocation"
            type="button"
            class="ml-auto rounded-lg bg-accent/90 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent"
            @click="onOpenLocation"
          >
            {{ openLocationLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-016);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}
</style>
