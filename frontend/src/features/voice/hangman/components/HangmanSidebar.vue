<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type {
  GuessLogRow,
  HitScoreRow,
} from '@/features/voice/hangman/hangmanTypes';
import { safeImageUrl } from '@/utils/safeImageUrl';

defineProps<{
  guessLogEntries: readonly GuessLogRow[];
  hitScoreboard: readonly HitScoreRow[];
  topHitScorer: HitScoreRow | null;
  topHitIsTied: boolean;
  topHitTiedNames: string;
}>();
</script>

<template>
  <div class="hm-sidebar">
    <div v-if="guessLogEntries.length" class="hm-guess-log">
      <p class="hm-guess-log__title">Guess history</p>
      <ol class="hm-guess-log__list">
        <li
          v-for="(row, idx) in guessLogEntries"
          :key="`glog-${idx}-${row.letter}-${row.userId}`"
          class="hm-guess-log__row"
          :class="
            row.hit ? 'hm-guess-log__row--hit' : 'hm-guess-log__row--miss'
          "
        >
          <div class="hm-guess-log__meta">
            <span class="hm-guess-log__phrase"
              >{{ row.displayName }} guessed</span
            >
            <span class="hm-guess-log__letter" aria-hidden="true">{{
              row.letter
            }}</span>
          </div>
          <span
            class="hm-guess-log__verdict"
            :class="
              row.hit
                ? 'hm-guess-log__verdict--hit'
                : 'hm-guess-log__verdict--miss'
            "
            >{{ row.hit ? 'Hit' : 'Miss' }}</span
          >
        </li>
      </ol>
    </div>

    <div class="hm-hit-board">
      <p class="hm-hit-board__title">Correct guesses</p>
      <template v-if="hitScoreboard.length">
        <p v-if="topHitScorer" class="hm-hit-board__lead">
          <span class="hm-hit-board__lead-label">{{
            topHitIsTied ? 'Top (tied)' : 'Top'
          }}</span>
          <span class="hm-hit-board__lead-name">{{ topHitTiedNames }}</span>
          <span class="hm-hit-board__lead-count">{{
            topHitScorer.correctCount
          }}</span>
        </p>
        <ol class="hm-hit-board__list">
          <li
            v-for="(row, idx) in hitScoreboard"
            :key="`hit-${row.userId || 'unk'}-${idx}`"
            class="hm-hit-board__row"
            :class="{ 'hm-hit-board__row--first': idx === 0 }"
          >
            <span class="hm-hit-board__rank" aria-hidden="true">{{
              idx + 1
            }}</span>
            <div class="hm-hit-board__avatar" aria-hidden="true">
              <PausedGifAvatar
                :src="safeImageUrl(row.pfpUrl)"
                :alt="row.displayName"
                :session-key="row.userId || `hit-${idx}`"
                wrapper-class="relative block h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-white/12"
                img-class="rounded-full object-cover"
              />
            </div>
            <span class="hm-hit-board__name">{{ row.displayName }}</span>
            <span class="hm-hit-board__score">{{ row.correctCount }}</span>
          </li>
        </ol>
      </template>
      <p v-else class="hm-hit-board__empty">No letter hits yet</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hm-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-width: 0;
}

/* ── Guess history ───────────────────────────────────────────── */
.hm-guess-log {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  max-height: 9rem;
  min-height: 0;
}

.hm-guess-log__title {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
}

.hm-guess-log__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
  min-height: 0;
}

.hm-guess-log__row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--hm-border);
}

.hm-guess-log__row--hit {
  border-color: rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.06);
}

.hm-guess-log__row--miss {
  border-color: rgba(244, 63, 94, 0.2);
  background: rgba(244, 63, 94, 0.05);
}

.hm-guess-log__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.hm-guess-log__phrase {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--hm-text-soft);
  flex-shrink: 0;
}

.hm-guess-log__letter {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--hm-text);
}

.hm-guess-log__verdict {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hm-guess-log__verdict--hit {
  color: var(--hm-hit);
}

.hm-guess-log__verdict--miss {
  color: var(--hm-miss);
}

/* ── Hit scoreboard (per round) ─────────────────────────────── */
.hm-hit-board {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  min-height: 0;
}

.hm-hit-board__title {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
}

.hm-hit-board__lead {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.28);
}

.hm-hit-board__lead-label {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hm-hit);
}

.hm-hit-board__lead-name {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--hm-text);
  line-height: 1.25;
}

.hm-hit-board__lead-count {
  font-size: 0.85rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: #6ee7b7;
}

.hm-hit-board__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  max-height: 8.5rem;
  overflow-y: auto;
  min-height: 0;
}

.hm-hit-board__row {
  display: grid;
  grid-template-columns: 1.1rem 1.5rem 1fr auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.4rem;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--hm-border);
}

.hm-hit-board__row--first {
  border-color: rgba(16, 185, 129, 0.22);
}

.hm-hit-board__rank {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--hm-text-muted);
  text-align: center;
}

.hm-hit-board__name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--hm-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.hm-hit-board__score {
  font-size: 0.72rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--hm-text-soft);
}

.hm-hit-board__empty {
  margin: 0;
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  font-style: italic;
  padding: 0.2rem 0;
}
</style>
