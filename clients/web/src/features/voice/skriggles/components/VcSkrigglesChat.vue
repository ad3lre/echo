<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { EchoSkrigglesChatEntryV1 } from '@/audio/voiceEchoLiveKitData';

const props = defineProps<{
  chatLog: readonly EchoSkrigglesChatEntryV1[];
  canGuess: boolean;
  displayNameFor: (userId: string) => string;
  submitGuess: (guess: string) => void;
}>();

const guessDraft = ref('');
const logEl = ref<HTMLElement | null>(null);

function onSubmitGuess(): void {
  const text = guessDraft.value.trim();
  if (!text || !props.canGuess) return;
  props.submitGuess(text);
  guessDraft.value = '';
}

function rowClass(kind: EchoSkrigglesChatEntryV1['kind']): string {
  if (kind === 'correct') return 'sk-chat__row--correct';
  if (kind === 'close') return 'sk-chat__row--close';
  if (kind === 'system') return 'sk-chat__row--system';
  return 'sk-chat__row--guess';
}

function rowLabel(entry: EchoSkrigglesChatEntryV1): string {
  if (entry.kind === 'system') return entry.text;
  const who = entry.userId.trim()
    ? props.displayNameFor(entry.userId)
    : 'Someone';
  if (entry.kind === 'correct') {
    const pts = entry.points != null ? ` (+${entry.points})` : '';
    return `${who} guessed "${entry.text}"${pts}`;
  }
  if (entry.kind === 'close') {
    return `${who} is close with "${entry.text}"`;
  }
  return `${who}: ${entry.text}`;
}

watch(
  () => props.chatLog.length,
  async () => {
    await nextTick();
    const el = logEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);
</script>

<template>
  <section class="sk-chat" aria-label="Guess chat">
    <p class="sk-chat__title">Guesses</p>
    <ol
      ref="logEl"
      class="sk-chat__log custom-scrollbar"
      aria-live="polite"
      aria-relevant="additions"
    >
      <li
        v-for="(entry, idx) in chatLog"
        :key="`${entry.at}-${entry.kind}-${entry.userId}-${idx}`"
        class="sk-chat__row"
        :class="rowClass(entry.kind)"
      >
        {{ rowLabel(entry) }}
      </li>
      <li v-if="!chatLog.length" class="sk-chat__empty">No guesses yet</li>
    </ol>
    <form class="sk-chat__form" @submit.prevent="onSubmitGuess">
      <input
        v-model="guessDraft"
        type="text"
        class="sk-chat__input"
        maxlength="64"
        autocomplete="off"
        spellcheck="false"
        placeholder="Type your guess…"
        :disabled="!canGuess"
        aria-label="Guess input"
      />
      <button
        type="submit"
        class="sk-chat__send"
        :disabled="!canGuess || !guessDraft.trim()"
      >
        Guess
      </button>
    </form>
  </section>
</template>

<style scoped lang="scss" src="./styles/VcSkrigglesChat.scss"></style>
