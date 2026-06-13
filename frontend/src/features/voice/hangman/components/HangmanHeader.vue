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

<style scoped lang="scss">
/* ── Header ─────────────────────────────────────────────────── */
.hm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--hm-border);
  background: rgba(255, 255, 255, 0.018);
  flex-shrink: 0;
}

.hm-header__brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.hm-header__rope-icon {
  width: 1.25rem;
  height: 1.6rem;
  color: var(--hm-accent);
  flex-shrink: 0;
}

.hm-header__wordmark {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--hm-text);
}

.hm-header__badge {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--hm-border);
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
}

.hm-header__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hm-players {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 14rem;
  overflow: hidden;
}

.hm-players__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--hm-hit);
  flex-shrink: 0;
  box-shadow: 0 0 5px var(--hm-hit-glow);
}

.hm-players__text {
  font-size: 0.72rem;
  color: var(--hm-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Rules dropdown ─────────────────────────────────────────── */
.hm-rules {
  position: relative;
}

.hm-rules__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  cursor: pointer;
  color: var(--hm-text-muted);
  transition:
    color 0.15s,
    background 0.15s;
  list-style: none;

  &:hover {
    color: var(--hm-text-soft);
    background: rgba(255, 255, 255, 0.06);
  }

  svg {
    width: 1.1rem;
    height: 1.1rem;
  }
}

.hm-rules__btn::-webkit-details-marker {
  display: none;
}

.hm-rules__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  z-index: 30;
  width: 18rem;
  background: #1a1730;
  border: 1px solid var(--hm-border-mid);
  border-radius: 10px;
  padding: 1rem;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

.hm-rules__title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--hm-accent);
  margin-bottom: 0.6rem;
}

.hm-rules__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  li {
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--hm-text-soft);
    padding-left: 1rem;
    position: relative;

    &::before {
      content: '·';
      position: absolute;
      left: 0;
      color: var(--hm-text-muted);
    }

    strong {
      color: var(--hm-text);
      font-weight: 600;
    }
  }
}
</style>
