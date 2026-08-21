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

<style scoped lang="scss">
/* ── Puzzle panel ────────────────────────────────────────────── */
.hm-puzzle-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  flex: 1;
}

/* ── Tiles ───────────────────────────────────────────────────── */
.hm-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  align-items: flex-start;
  justify-content: center;
  padding: 0.85rem 0.5rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  min-height: 5.5rem;
}

.hm-word {
  display: flex;
  gap: 0.28rem;
  align-items: flex-end;
  flex-wrap: nowrap;
}

.hm-tile {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(1.85rem, 5.5vw, 2.35rem);
  height: clamp(2.4rem, 7vw, 3rem);
  border-radius: 6px;
  font-size: clamp(0.9rem, 2.8vw, 1.25rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  font-family: var(--font-mono, ui-monospace, monospace);
  transition:
    background 0.2s,
    border-color 0.25s,
    box-shadow 0.25s;
}

.hm-tile--blank {
  background: rgba(255, 255, 255, 0.025);
  border: 2px solid rgba(255, 255, 255, 0.07);
  border-bottom-color: rgba(255, 255, 255, 0.18);
  color: transparent;
}

.hm-tile--blank-pulse {
  border-bottom-color: rgba(245, 158, 11, 0.35);
}

.hm-tile--lit {
  background: rgba(255, 255, 255, 0.07);
  border: 2px solid rgba(255, 255, 255, 0.13);
  border-bottom-color: rgba(255, 255, 255, 0.28);
  color: var(--hm-text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.hm-tile--fresh {
  background: rgba(16, 185, 129, 0.13);
  border-color: rgba(16, 185, 129, 0.45);
  box-shadow:
    0 0 12px rgba(16, 185, 129, 0.22),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
  animation: hm-tile-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ── Answer reveal ───────────────────────────────────────────── */
.hm-answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.85rem 1.1rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border-mid);
  border-radius: var(--hm-radius);
  text-align: center;
}

.hm-answer__eyebrow {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
}

.hm-answer__text {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: clamp(0.95rem, 3vw, 1.25rem);
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--hm-text);
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: center;
  line-height: 1.35;
}

/* ── Letter tracker ──────────────────────────────────────────── */
.hm-tracker {
  display: flex;
  gap: 0;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  overflow: hidden;
}

.hm-tracker__col {
  flex: 1;
  padding: 0.65rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.hm-tracker__divider {
  width: 1px;
  background: var(--hm-border);
  flex-shrink: 0;
}

@media (max-width: 440px) {
  .hm-tracker {
    flex-direction: column;
  }

  .hm-tracker__divider {
    width: 100%;
    height: 1px;
  }
}

.hm-tracker__label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;

  svg {
    width: 0.7rem;
    height: 0.7rem;
    flex-shrink: 0;
  }
}

.hm-tracker__label--hit {
  color: var(--hm-hit);
}
.hm-tracker__label--miss {
  color: var(--hm-miss);
}

.hm-tracker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  min-height: 1.4rem;
}

.hm-tracker__empty {
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  font-style: italic;
}

/* ── Chips (letter pills) ────────────────────────────────────── */
.hm-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  border-radius: 5px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-family: var(--font-mono, ui-monospace, monospace);
  border: 1px solid;
  transition: box-shadow 0.2s;
}

.hm-chip--hit {
  background: var(--hm-hit-dim);
  border-color: rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
}

.hm-chip--miss {
  background: var(--hm-miss-dim);
  border-color: rgba(244, 63, 94, 0.3);
  color: #fca5a5;
}

.hm-chip--fresh {
  box-shadow: 0 0 8px currentColor;
  animation: hm-chip-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ── Last guess feedback ─────────────────────────────────────── */
.hm-feedback {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid;
  font-size: 0.8rem;
  font-weight: 600;
  align-self: center;
  animation: hm-feedback-in 0.28s ease-out;
  text-align: left;
  max-width: 100%;
  box-sizing: border-box;
}

@media (max-width: 420px) {
  .hm-feedback {
    border-radius: 12px;
    padding: 0.55rem 0.75rem;
    align-self: stretch;
  }

  .hm-feedback__who {
    max-width: none;
    white-space: normal;
  }
}

.hm-feedback__main {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.hm-feedback__who {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--hm-text-soft);
  line-height: 1.2;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hm-feedback__guess {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.hm-feedback--hit {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.08);
  color: #6ee7b7;
}

.hm-feedback--miss {
  border-color: rgba(244, 63, 94, 0.32);
  background: rgba(244, 63, 94, 0.07);
  color: #fca5a5;
}

.hm-feedback__letter {
  font-size: 0.95rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
}

.hm-feedback__verdict {
  font-size: 0.76rem;
  opacity: 0.85;
}

@keyframes hm-tile-pop {
  0% {
    transform: scale(0.88) translateY(3px);
  }
  55% {
    transform: scale(1.06) translateY(-1px);
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

@keyframes hm-chip-pop {
  0% {
    transform: scale(0.78);
  }
  65% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes hm-feedback-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hm-tile--fresh,
  .hm-chip--fresh,
  .hm-feedback {
    animation: none;
  }
}

/* ── Light theme overrides ───────────────────────────────────── */
[data-theme='light'] .hm-chip--hit {
  color: #065f46;
}
[data-theme='light'] .hm-chip--miss {
  color: #9f1239;
}

[data-theme='light'] .hm-tile--lit {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
  color: #1a1630;
}

[data-theme='light'] .hm-tile--blank {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  border-bottom-color: rgba(0, 0, 0, 0.25);
}
</style>
