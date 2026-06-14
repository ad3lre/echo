<script setup lang="ts">
import { computed } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import { safeImageUrl } from '@/utils/safeImageUrl';
import type { GuildEventActivityCard } from '@/features/layout/appLayoutLeftChromeProps';

const props = withDefaults(
  defineProps<{
    cards: GuildEventActivityCard[];
  }>(),
  {
    cards: () => [],
  },
);

const emit = defineEmits<{
  open: [
    payload: {
      serverId: string;
      channelId: string | null;
      customLocation?: string | null;
      eventId: string;
    },
  ];
}>();

function pillLabel(card: GuildEventActivityCard): string {
  return `Open ${card.title} in ${card.serverName}`;
}

function formatStart(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const layoutSingleColumn = computed(() => props.cards.length === 1);
</script>

<template>
  <section
    v-if="cards.length > 0"
    class="guild-event-strip w-full shrink-0"
    aria-label="Upcoming events you are going to"
  >
    <div
      class="guild-event-strip__scroller pb-0.5 pt-0.5 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,140,0.35)_transparent]"
      :class="
        layoutSingleColumn
          ? 'block w-full'
          : 'flex touch-pan-x gap-2 overflow-x-auto'
      "
    >
      <button
        v-for="card in cards"
        :key="`${card.serverId}:${card.eventId}`"
        type="button"
        class="guild-event-strip__pill flex min-h-[44px] min-w-0 items-center gap-2 rounded-2xl border border-border bg-glass-1 px-2.5 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        :class="
          layoutSingleColumn
            ? 'w-full max-w-none snap-none'
            : 'max-w-none shrink-0 snap-start sm:min-w-[min(26rem,92vw)]'
        "
        :aria-label="pillLabel(card)"
        @click="
          emit('open', {
            serverId: card.serverId,
            channelId: card.channelId,
            customLocation: card.customLocation ?? null,
            eventId: card.eventId,
          })
        "
      >
        <div
          v-if="card.eventImageUrl?.trim()"
          class="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-surface"
        >
          <img
            :src="safeImageUrl(card.eventImageUrl.trim())"
            alt=""
            class="h-full w-full object-cover"
          />
        </div>
        <div
          class="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-surface"
        >
          <PausedGifAvatar
            :src="serverGuildIconDisplayUrl(card.serverImageUrl)"
            :alt="card.serverName"
            :session-key="card.serverId"
            img-class="h-full w-full object-cover"
          />
          <span
            class="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--surface)] bg-indigo-500 shadow-sm"
            aria-hidden="true"
            title="Scheduled event"
          >
            <img
              :src="icons.bellSchool"
              alt=""
              class="h-2.5 w-2.5 opacity-95 brightness-0 invert"
            />
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-[13px] font-semibold leading-tight text-foreground"
          >
            {{ card.title }}
          </p>
          <p
            class="truncate text-[11px] leading-snug text-fg-subtle flex min-w-0 items-center gap-1"
          >
            <span class="truncate text-fg-soft">{{ card.serverName }}</span>
            <span class="shrink-0 text-fg-subtle/80" aria-hidden="true">·</span>
            <span class="truncate">{{ formatStart(card.startsAt) }}</span>
            <template v-if="card.channelDisplayName">
              <span class="shrink-0" aria-hidden="true">·</span>
              <span class="truncate">{{ card.channelDisplayName }}</span>
            </template>
            <template v-else-if="card.customLocation?.trim()">
              <span class="shrink-0" aria-hidden="true">·</span>
              <span class="truncate">{{
                card.customLocation.trim().length > 56
                  ? `${card.customLocation.trim().slice(0, 56)}…`
                  : card.customLocation.trim()
              }}</span>
            </template>
          </p>
          <p class="text-[10px] text-fg-soft">
            {{ card.goingCount }}
            {{ card.goingCount === 1 ? 'person' : 'people' }} going
          </p>
        </div>
        <span
          class="shrink-0 rounded-full bg-accent/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white"
        >
          Open
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.guild-event-strip__scroller {
  -webkit-overflow-scrolling: touch;
}
</style>
