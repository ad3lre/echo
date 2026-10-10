<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type {
  GuessLogRow,
  HitScoreRow,
} from '@/features/voice/hangman/hangmanTypes';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

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

<style scoped lang="scss" src="./styles/HangmanSidebar.scss"></style>
