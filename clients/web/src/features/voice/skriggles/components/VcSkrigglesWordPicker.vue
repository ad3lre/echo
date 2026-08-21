<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { timeRemainingSec } from '@/features/voice/skriggles/vcSkrigglesScoring';

const props = defineProps<{
  wordChoices: [string, string, string] | null;
  phaseEndsAt: number | null;
  isDrawer: boolean;
  drawerDisplayName: string;
  commitWordChoice: (word: string) => void;
}>();

const secondsLeft = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

function tickCountdown(): void {
  secondsLeft.value = timeRemainingSec(props.phaseEndsAt);
}

onMounted(() => {
  tickCountdown();
  timer = setInterval(tickCountdown, 250);
});

onUnmounted(() => {
  if (timer != null) clearInterval(timer);
});

const choices = computed(() => props.wordChoices ?? []);

function pick(word: string): void {
  if (!props.isDrawer) return;
  props.commitWordChoice(word);
}
</script>

<template>
  <section class="sk-wordpick" aria-label="Word picker">
    <template v-if="isDrawer && choices.length === 3">
      <p class="sk-wordpick__eyebrow">Pick a word to draw</p>
      <p class="sk-wordpick__hint">
        Choose one of three words before the timer runs out.
      </p>
      <p
        class="sk-wordpick__timer"
        :class="{ 'sk-wordpick__timer--urgent': secondsLeft <= 5 }"
        role="timer"
        :aria-label="`${secondsLeft} seconds remaining`"
      >
        {{ secondsLeft }}s
      </p>
      <div class="sk-wordpick__choices">
        <button
          v-for="word in choices"
          :key="word"
          type="button"
          class="sk-wordpick__choice"
          @click="pick(word)"
        >
          {{ word }}
        </button>
      </div>
    </template>

    <template v-else>
      <div class="sk-wordpick__waiting" role="status">
        <div class="sk-wordpick__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p class="sk-wordpick__who">{{ drawerDisplayName }}</p>
        <p class="sk-wordpick__label">is choosing a word to draw…</p>
        <p class="sk-wordpick__timer sk-wordpick__timer--muted">
          {{ secondsLeft }}s left
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.sk-wordpick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  text-align: center;
}

.sk-wordpick__eyebrow {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sk-accent);
}

.sk-wordpick__hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--sk-text-soft);
  max-width: 22rem;
  line-height: 1.45;
}

.sk-wordpick__timer {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--sk-text);
}

.sk-wordpick__timer--urgent {
  color: var(--sk-miss);
  animation: sk-timer-pulse 0.8s ease-in-out infinite;
}

.sk-wordpick__timer--muted {
  font-size: 0.9rem;
  color: var(--sk-text-muted);
}

.sk-wordpick__choices {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: min(100%, 18rem);
}

.sk-wordpick__choice {
  border: 1px solid var(--sk-border-mid);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-family: var(--font-mono, ui-monospace, monospace);
  cursor: pointer;
  background: var(--sk-surface);
  color: var(--sk-text);
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.1s;

  &:hover {
    border-color: rgba(124, 58, 237, 0.55);
    background: rgba(124, 58, 237, 0.08);
  }

  &:active {
    transform: scale(0.98);
  }
}

.sk-wordpick__waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.sk-wordpick__dots {
  display: flex;
  gap: 0.45rem;
  margin-bottom: 0.35rem;

  span {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--sk-accent);
    animation: sk-dot-bounce 1.2s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.18s;
    }
    &:nth-child(3) {
      animation-delay: 0.36s;
    }
  }
}

.sk-wordpick__who {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--sk-text);
}

.sk-wordpick__label {
  margin: 0;
  font-size: 0.82rem;
  color: var(--sk-text-soft);
}

@keyframes sk-timer-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@keyframes sk-dot-bounce {
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
</style>
