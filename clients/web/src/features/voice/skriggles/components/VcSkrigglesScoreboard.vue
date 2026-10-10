<script setup lang="ts">
import { computed } from 'vue';
import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesRoundResultV1,
} from '@/audio/voiceEchoLiveKitData';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const props = defineProps<{
  activity: EchoSkrigglesActivityV1;
  rosterUserIds: readonly string[];
  voiceParticipants: readonly { id: string; name: string; pfp?: string }[];
  phase: 'round_reveal' | 'game_over';
  isOrchestrator: boolean;
  displayNameFor: (userId: string) => string;
  advanceRound: () => void;
}>();

type ScoreRow = {
  userId: string;
  displayName: string;
  pfpUrl: string;
  score: number;
};

const standings = computed((): ScoreRow[] => {
  const scores = props.activity.scores;
  const roster = props.activity.rosterUserIds.length
    ? props.activity.rosterUserIds
    : props.rosterUserIds;
  const rows: ScoreRow[] = roster.map((uid) => ({
    userId: uid,
    displayName: props.displayNameFor(uid),
    pfpUrl:
      props.voiceParticipants.find((p) => p.id === uid)?.pfp?.trim() ?? '',
    score: scores[uid] ?? 0,
  }));
  rows.sort(
    (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
  );
  return rows;
});

const roundResult = computed(
  (): EchoSkrigglesRoundResultV1 | null => props.activity.roundResult,
);

const winner = computed(() => standings.value[0] ?? null);

const isTiedTop = computed(() => {
  const rows = standings.value;
  if (rows.length < 2) return false;
  return rows[1]!.score === rows[0]!.score;
});

const tiedTopNames = computed(() => {
  if (!standings.value.length) return '';
  const top = standings.value[0]!.score;
  return standings.value
    .filter((r) => r.score === top)
    .map((r) => r.displayName)
    .join(', ');
});

const roundLabel = computed(
  () =>
    `Round ${props.activity.roundSeq + 1} of ${props.activity.settings.rounds}`,
);
</script>

<template>
  <section
    class="sk-scoreboard"
    :class="{ 'sk-scoreboard--final': phase === 'game_over' }"
    aria-label="Scoreboard"
  >
    <header class="sk-scoreboard__header">
      <p class="sk-scoreboard__eyebrow">
        {{ phase === 'game_over' ? 'Game over' : 'Round reveal' }}
      </p>
      <h2 v-if="phase === 'round_reveal'" class="sk-scoreboard__title">
        {{ roundLabel }}
      </h2>
      <p
        v-if="phase === 'round_reveal' && roundResult"
        class="sk-scoreboard__word"
      >
        The word was <strong>{{ roundResult.word }}</strong>
      </p>
      <p v-if="phase === 'game_over' && winner" class="sk-scoreboard__winner">
        <template v-if="isTiedTop">{{ tiedTopNames }} tie for first!</template>
        <template v-else>{{ winner.displayName }} wins!</template>
      </p>
    </header>

    <ol class="sk-scoreboard__list">
      <li
        v-for="(row, idx) in standings"
        :key="row.userId"
        class="sk-scoreboard__row"
        :class="{ 'sk-scoreboard__row--first': idx === 0 }"
      >
        <span class="sk-scoreboard__rank" aria-hidden="true">{{
          idx + 1
        }}</span>
        <PausedGifAvatar
          :src="safeImageUrl(row.pfpUrl)"
          :alt="row.displayName"
          :session-key="row.userId"
          wrapper-class="relative block h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/12"
          img-class="rounded-full object-cover"
        />
        <span class="sk-scoreboard__name">{{ row.displayName }}</span>
        <span class="sk-scoreboard__score">{{ row.score }}</span>
      </li>
    </ol>

    <div v-if="phase === 'round_reveal'" class="sk-scoreboard__actions">
      <button
        type="button"
        class="sk-btn sk-btn--next"
        :disabled="!isOrchestrator"
        @click="advanceRound"
      >
        {{ isOrchestrator ? 'Next round' : 'Waiting for host…' }}
      </button>
      <p v-if="!isOrchestrator" class="sk-scoreboard__note">
        The roster host advances the game for everyone.
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss" src="./styles/VcSkrigglesScoreboard.scss"></style>
