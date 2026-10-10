<script setup lang="ts">
import { computed } from 'vue';
import type { PuzzleWord } from '@/features/voice/hangman/hangmanTypes';

const props = defineProps<{
  puzzleWords: readonly PuzzleWord[];
  phase: string | null;
  isSetter: boolean;
  lastGuess: string | null;
  roundResult: 'won' | 'lost' | null;
  answerReveal: string | null;
  hitLetters: readonly string[];
  missedLetters: readonly string[];
  lastGuessWasHit: boolean | null;
  lastGuessDisplayName: string;
}>();

const guessingActive = computed(
  () => props.phase === 'guessing' && !props.isSetter,
);
const showAnswer = computed(
  () => props.phase === 'round_over' && props.roundResult === 'lost',
);
const showFeedback = computed(
  () => !!props.lastGuess && props.phase === 'guessing',
);
</script>

<template>
  <div class="hm-puzzle-panel">
    <!-- Letter tiles -->
    <div class="hm-tiles" aria-live="polite" aria-atomic="true">
      <div v-for="(word, wi) in puzzleWords" :key="word.id" class="hm-word">
        <span
          v-for="(slot, si) in word.slots"
          :key="word.id + '-' + si"
          class="hm-tile"
          :class="
            slot === '_'
              ? ['hm-tile--blank', { 'hm-tile--blank-pulse': guessingActive }]
              : ['hm-tile--lit', { 'hm-tile--fresh': slot === lastGuess }]
          "
          :aria-label="
            slot === '_'
              ? `Word ${wi + 1}, letter ${si + 1}, hidden`
              : `Word ${wi + 1}, letter ${si + 1}, ${slot}`
          "
          >{{ slot === '_' ? '' : slot }}</span
        >
      </div>
    </div>

    <!-- Answer reveal on loss -->
    <div v-if="showAnswer" class="hm-answer">
      <span class="hm-answer__eyebrow">The phrase was</span>
      <span class="hm-answer__text">{{ answerReveal ?? '—' }}</span>
    </div>

    <!-- Letter tracker: hits + misses side by side -->
    <div class="hm-tracker">
      <div class="hm-tracker__col">
        <span class="hm-tracker__label hm-tracker__label--hit">
          <svg viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M1.5 5l2.5 2.5 4.5-5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Correct
        </span>
        <div class="hm-tracker__chips">
          <span
            v-for="l in hitLetters"
            :key="'h-' + l"
            class="hm-chip hm-chip--hit"
            :class="{ 'hm-chip--fresh': l === lastGuess }"
            >{{ l }}</span
          >
          <span v-if="!hitLetters.length" class="hm-tracker__empty"
            >none yet</span
          >
        </div>
      </div>
      <div class="hm-tracker__divider" aria-hidden="true" />
      <div class="hm-tracker__col">
        <span class="hm-tracker__label hm-tracker__label--miss">
          <svg viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 2l6 6M8 2L2 8"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          Missed
        </span>
        <div class="hm-tracker__chips">
          <span
            v-for="l in missedLetters"
            :key="'m-' + l"
            class="hm-chip hm-chip--miss"
            :class="{ 'hm-chip--fresh': l === lastGuess }"
            >{{ l }}</span
          >
          <span v-if="!missedLetters.length" class="hm-tracker__empty"
            >none yet</span
          >
        </div>
      </div>
    </div>

    <!-- Last guess feedback -->
    <div
      v-if="showFeedback"
      class="hm-feedback"
      :class="lastGuessWasHit ? 'hm-feedback--hit' : 'hm-feedback--miss'"
    >
      <div class="hm-feedback__main">
        <span class="hm-feedback__who">{{ lastGuessDisplayName }}</span>
        <div class="hm-feedback__guess">
          <span class="hm-feedback__letter">{{ lastGuess }}</span>
          <span class="hm-feedback__verdict">{{
            lastGuessWasHit ? 'correct!' : 'miss'
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/HangmanPuzzle.scss"></style>
