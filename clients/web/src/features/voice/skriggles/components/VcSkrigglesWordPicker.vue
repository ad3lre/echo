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

<style scoped lang="scss" src="./styles/VcSkrigglesWordPicker.scss"></style>
