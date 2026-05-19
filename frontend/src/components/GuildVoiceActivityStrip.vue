<script setup lang="ts">
import { computed } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import { safeImageUrl } from '@/utils/safeImageUrl';
import type { GuildVoiceActivityCard } from '@/features/layout/appLayoutLeftChromeProps';
import VoiceChannelUserLimitBadge from '@/features/voice/components/VoiceChannelUserLimitBadge.vue';
import { getVoiceChannelUserLimitUi } from '@/features/voice/domain/voiceChannelUserLimit';

const props = withDefaults(
  defineProps<{
    cards: GuildVoiceActivityCard[];
    /** When set, matches a row where the user is already connected in this guild. */
    currentVoiceChannelId?: string | null;
    canJoinChannel?: (channelId: string) => boolean;
  }>(),
  {
    cards: () => [],
    currentVoiceChannelId: null,
    canJoinChannel: () => true,
  },
);

const emit = defineEmits<{
  join: [
    payload: {
      serverId: string;
      channelId: string;
      channelName: string;
    },
  ];
  'participant-contextmenu': [
    payload: {
      userId: string;
      serverId: string;
      channelId: string;
      event: MouseEvent;
    },
  ];
}>();

function onJoin(card: GuildVoiceActivityCard) {
  if (!props.canJoinChannel?.(card.channelId)) return;
  emit('join', {
    serverId: card.serverId,
    channelId: card.channelId,
    channelName: card.channelDisplayName,
  });
}

function onParticipantContextMenu(
  card: GuildVoiceActivityCard,
  userId: string,
  e: MouseEvent,
) {
  e.preventDefault();
  e.stopPropagation();
  emit('participant-contextmenu', {
    userId,
    serverId: card.serverId,
    channelId: card.channelId,
    event: e,
  });
}

function pillLabel(card: GuildVoiceActivityCard): string {
  const n = card.participantCount;
  const people = n === 1 ? '1 person in voice' : `${n} people in voice`;
  return `Join ${card.channelDisplayName} in ${card.serverName}, ${people}`;
}

function participantOverflow(card: GuildVoiceActivityCard): number {
  return Math.max(0, card.participantCount - card.participantPfpUrls.length);
}

function voiceLimitUiForCard(card: GuildVoiceActivityCard) {
  return getVoiceChannelUserLimitUi(card.participantCount, card.userLimit);
}

const layoutSingleColumn = computed(() => props.cards.length === 1);
</script>

<template>
  <section
    v-if="cards.length > 0"
    class="guild-vc-strip w-full shrink-0"
    aria-label="Active voice channels in your servers"
  >
    <div
      class="guild-vc-strip__scroller pb-0.5 pt-0.5 [scrollbar-width:thin] [scrollbar-color:rgba(120,120,140,0.35)_transparent]"
      :class="
        layoutSingleColumn
          ? 'block w-full'
          : 'flex touch-pan-x gap-2 overflow-x-auto'
      "
    >
      <button
        v-for="card in cards"
        :key="`${card.serverId}:${card.channelId}`"
        type="button"
        class="guild-vc-strip__pill flex min-h-[44px] min-w-0 items-center gap-2 rounded-2xl border border-border bg-glass-1 px-2.5 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-55"
        :class="
          layoutSingleColumn
            ? 'w-full max-w-none snap-none'
            : 'max-w-none shrink-0 snap-start sm:min-w-[min(26rem,92vw)]'
        "
        :disabled="!canJoinChannel(card.channelId)"
        :aria-label="pillLabel(card)"
        :title="
          !canJoinChannel(card.channelId)
            ? 'You cannot connect to this voice channel'
            : currentVoiceChannelId === card.channelId
              ? 'Open voice channel'
              : 'Join voice channel'
        "
        @click="onJoin(card)"
      >
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
            class="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-surface shadow-sm"
            aria-hidden="true"
          >
            <img
              :src="icons.headphones"
              alt=""
              class="h-2.5 w-2.5 opacity-90 dark:brightness-0 dark:invert"
            />
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-[13px] font-semibold leading-tight text-foreground"
          >
            {{ card.channelDisplayName }}
          </p>
          <p
            class="truncate text-[11px] leading-snug text-fg-subtle flex items-center gap-1 min-w-0"
          >
            <span class="truncate text-fg-soft">{{ card.serverName }}</span>
            <span class="shrink-0 text-fg-subtle/80" aria-hidden="true">·</span>
            <template v-if="voiceLimitUiForCard(card)">
              <VoiceChannelUserLimitBadge
                :label="voiceLimitUiForCard(card)!.label"
                :tone="voiceLimitUiForCard(card)!.tone"
                :title="`${voiceLimitUiForCard(card)!.count} of ${voiceLimitUiForCard(card)!.limit} in voice`"
              />
              <span class="truncate">in voice</span>
            </template>
            <template v-else>
              <span>{{ card.participantCount }}</span>
              {{ card.participantCount === 1 ? 'person' : 'people' }} in voice
            </template>
          </p>
        </div>
        <div
          v-if="card.participantPfpUrls.length > 0"
          class="guild-vc-strip__pfps flex shrink-0 items-center gap-1"
          aria-hidden="true"
        >
          <div class="flex items-center -space-x-2">
            <button
              v-for="(pfp, idx) in card.participantPfpUrls"
              :key="`${card.channelId}-vc-${card.participantPreviewUserIds[idx] ?? idx}`"
              type="button"
              class="relative h-8 w-8 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--glass-tint)] shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              :style="{ zIndex: 10 - idx }"
              :aria-label="`Options for participant`"
              @click.stop
              @contextmenu.stop.prevent="
                onParticipantContextMenu(
                  card,
                  card.participantPreviewUserIds[idx] ?? '',
                  $event,
                )
              "
            >
              <PausedGifAvatar
                :src="safeImageUrl(pfp)"
                alt=""
                :session-key="
                  card.participantPreviewUserIds[idx] ??
                  `${card.channelId}-p-${idx}`
                "
                img-class="h-full w-full object-cover"
              />
            </button>
          </div>
          <div
            v-if="participantOverflow(card) > 0"
            class="flex h-8 min-w-8 items-center justify-center rounded-full border border-border bg-glass-2 px-1.5 text-[10px] font-semibold tabular-nums text-fg-soft shadow-sm"
          >
            +{{ participantOverflow(card) }}
          </div>
        </div>
        <span
          class="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          :class="
            currentVoiceChannelId === card.channelId
              ? 'bg-glass-2 text-fg-subtle ring-1 ring-border'
              : canJoinChannel(card.channelId)
                ? 'bg-emerald-500/90 text-white'
                : 'bg-glass-2 text-fg-subtle'
          "
        >
          {{
            currentVoiceChannelId === card.channelId
              ? 'Open'
              : canJoinChannel(card.channelId)
                ? 'Join'
                : 'Locked'
          }}
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.guild-vc-strip__scroller {
  -webkit-overflow-scrolling: touch;
}
</style>
