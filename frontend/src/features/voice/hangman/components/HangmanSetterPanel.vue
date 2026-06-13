<script setup lang="ts">
defineProps<{
  isSetter: boolean;
  setterName: string;
  maxLen: number;
  phraseHelp: string;
  commitError: string;
}>();

const emit = defineEmits<{ submit: [] }>();

const draft = defineModel<string>('draft', { required: true });
</script>

<template>
  <!-- Setter: phrase entry card -->
  <div v-if="isSetter" class="hm-setter">
    <div class="hm-setter__intro">
      <p class="hm-setter__eyebrow">Your turn to set the puzzle</p>
      <p class="hm-setter__hint">
        Type any phrase using A–Z and spaces. Everyone else only sees blanks
        until they guess.
      </p>
    </div>
    <textarea
      id="vc-hangman-phrase"
      v-model="draft"
      rows="2"
      :maxlength="maxLen"
      class="hm-setter__input"
      placeholder="e.g. ECHO PARTY LINE"
      autocomplete="off"
      autocapitalize="characters"
    />
    <div class="hm-setter__footer">
      <span class="hm-setter__count">{{ phraseHelp }}</span>
      <p v-if="commitError" class="hm-setter__error" role="alert">
        {{ commitError }}
      </p>
      <button type="button" class="hm-btn hm-btn--lock" @click="emit('submit')">
        <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect
            x="3"
            y="8"
            width="12"
            height="9"
            rx="2"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M6 8V6a3 3 0 0 1 6 0v2"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
        Lock in phrase
      </button>
    </div>
  </div>

  <!-- Setter: waiting for phrase -->
  <div v-else class="hm-waiting">
    <div class="hm-waiting__dots" aria-hidden="true">
      <span class="hm-waiting__dot" />
      <span class="hm-waiting__dot" />
      <span class="hm-waiting__dot" />
    </div>
    <p class="hm-waiting__who">{{ setterName }}</p>
    <p class="hm-waiting__label">is crafting the secret phrase…</p>
  </div>
</template>

<style scoped lang="scss">
/* ── Setter card ─────────────────────────────────────────────── */
.hm-setter {
  margin: 0.75rem;
  padding: 1.25rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border-mid);
  border-radius: var(--hm-radius);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.hm-setter__eyebrow {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hm-accent);
  margin-bottom: 0.2rem;
}

.hm-setter__hint {
  font-size: 0.8rem;
  color: var(--hm-text-soft);
  line-height: 1.5;
}

.hm-setter__input {
  width: 100%;
  min-height: 4rem;
  resize: vertical;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--hm-border-mid);
  border-radius: 8px;
  padding: 0.7rem 0.85rem;
  color: var(--hm-text);
  font-size: 0.9rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.08em;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &::placeholder {
    color: var(--hm-text-muted);
    letter-spacing: 0.04em;
  }

  &:focus {
    border-color: rgba(245, 158, 11, 0.5);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }
}

.hm-setter__footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.hm-setter__count {
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  flex: 1;
  min-width: 0;
}

.hm-setter__error {
  font-size: 0.75rem;
  color: var(--hm-miss);
  font-weight: 500;
  width: 100%;
  order: 3;
}

/* ── Waiting state ───────────────────────────────────────────── */
.hm-waiting {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 2.5rem 1.5rem;
  text-align: center;
}

.hm-waiting__dots {
  display: flex;
  gap: 0.45rem;
  margin-bottom: 0.5rem;
}

.hm-waiting__dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--hm-accent);
  animation: hm-waiting-bounce 1.2s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.18s;
  }
  &:nth-child(3) {
    animation-delay: 0.36s;
  }
}

.hm-waiting__who {
  font-size: 1rem;
  font-weight: 700;
  color: var(--hm-text);
}

.hm-waiting__label {
  font-size: 0.82rem;
  color: var(--hm-text-soft);
}

/* ── Lock button ─────────────────────────────────────────────── */
.hm-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: 9px;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition:
    opacity 0.15s,
    transform 0.1s,
    box-shadow 0.15s;
  user-select: none;

  svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  &:active {
    transform: scale(0.98);
  }
}

.hm-btn--lock {
  padding: 0.55rem 1.1rem;
  background: var(--hm-accent);
  color: #18130a;
  box-shadow:
    0 3px 0 rgba(0, 0, 0, 0.4),
    0 0 18px rgba(245, 158, 11, 0.25);

  &:hover {
    opacity: 0.93;
  }
}

@keyframes hm-waiting-bounce {
  0%,
  80%,
  100% {
    transform: scale(0.7);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hm-waiting__dot {
    animation: none;
  }
}
</style>
