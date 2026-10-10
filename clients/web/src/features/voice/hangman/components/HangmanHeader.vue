<script setup lang="ts">
defineProps<{
  rosterLabel: string;
  playerCount: number;
}>();
</script>

<template>
  <header class="hm-header">
    <div class="hm-header__brand">
      <svg
        class="hm-header__rope-icon"
        viewBox="0 0 22 28"
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="11"
          y1="2"
          x2="11"
          y2="6"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
        <line
          x1="4"
          y1="6"
          x2="18"
          y2="6"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
        <line
          x1="18"
          y1="6"
          x2="18"
          y2="12"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
        <path
          d="M18 12 Q18 17 14 18"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          fill="none"
        />
        <circle
          cx="12"
          cy="22"
          r="5"
          stroke="currentColor"
          stroke-width="2.2"
          fill="none"
        />
      </svg>
      <span class="hm-header__wordmark">Hangman</span>
      <span class="hm-header__badge">Voice</span>
    </div>
    <div class="hm-header__right">
      <div v-if="playerCount" class="hm-players">
        <span class="hm-players__dot" aria-hidden="true" />
        <span class="hm-players__text">{{ rosterLabel }}</span>
      </div>
      <details class="hm-rules">
        <summary class="hm-rules__btn" aria-label="How to play">
          <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle
              cx="9"
              cy="9"
              r="8"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M9 8.2v4.8M9 5.5v1"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </summary>
        <div class="hm-rules__panel">
          <p class="hm-rules__title">How it works</p>
          <ul class="hm-rules__list">
            <li>
              <strong>Setter</strong> types a secret A–Z phrase. Everyone else
              sees blanks.
            </li>
            <li>
              <strong>Guessers</strong> pick one letter per turn. Green =
              correct, red = miss.
            </li>
            <li>
              <strong>6 misses</strong> completes the drawing and ends the
              round.
            </li>
            <li>
              <strong>Turns</strong> rotate round-robin through everyone in this
              voice room.
            </li>
            <li>
              <strong>Sync</strong> — the roster host can apply guesses if the
              setter’s connection blips.
            </li>
          </ul>
        </div>
      </details>
    </div>
  </header>
</template>

<style scoped lang="scss" src="./styles/HangmanHeader.scss"></style>
