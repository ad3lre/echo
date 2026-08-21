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

<style scoped lang="scss">
.sk-scoreboard {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.85rem;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border-mid);
  border-radius: var(--sk-radius);
}

.sk-scoreboard--final {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(124, 58, 237, 0.06);
}

.sk-scoreboard__header {
  text-align: center;
}

.sk-scoreboard__eyebrow {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sk-accent);
}

.sk-scoreboard__title {
  margin: 0.25rem 0 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--sk-text);
}

.sk-scoreboard__word {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--sk-text-soft);

  strong {
    font-family: var(--font-mono, ui-monospace, monospace);
    letter-spacing: 0.08em;
    color: var(--sk-text);
  }
}

.sk-scoreboard__winner {
  margin: 0.35rem 0 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--sk-text);
}

.sk-scoreboard__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.sk-scoreboard__row {
  display: grid;
  grid-template-columns: 1.4rem 1.75rem 1fr auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--sk-border);
}

.sk-scoreboard__row--first {
  border-color: rgba(124, 58, 237, 0.35);
  background: rgba(124, 58, 237, 0.08);
}

.sk-scoreboard__rank {
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--sk-text-muted);
  text-align: center;
}

.sk-scoreboard__name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--sk-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sk-scoreboard__score {
  font-size: 0.85rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--sk-text-soft);
}

.sk-scoreboard__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.sk-scoreboard__note {
  margin: 0;
  font-size: 0.74rem;
  color: var(--sk-text-muted);
  text-align: center;
}

.sk-btn {
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  padding: 0.65rem 1.5rem;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.sk-btn--next {
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
  color: white;
  box-shadow: 0 4px 0 #2d1668;
}
</style>
