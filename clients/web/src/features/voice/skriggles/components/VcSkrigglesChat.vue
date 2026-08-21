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

<style scoped lang="scss">
.sk-chat {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 0;
  flex: 1;
}

.sk-chat__title {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sk-text-muted);
}

.sk-chat__log {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
  flex: 1;
  min-height: 5rem;
  max-height: 14rem;
  overflow-y: auto;
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius);
  background: var(--sk-surface);
  padding: 0.55rem;
}

.sk-chat__row {
  font-size: 0.76rem;
  line-height: 1.4;
  padding: 0.35rem 0.45rem;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--sk-border);
  color: var(--sk-text-soft);
}

.sk-chat__row--correct {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.08);
  color: var(--sk-hit);
}

.sk-chat__row--close {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.08);
  color: var(--sk-accent);
}

.sk-chat__row--system {
  border-style: dashed;
  font-style: italic;
  color: var(--sk-text-muted);
}

.sk-chat__empty {
  font-size: 0.74rem;
  color: var(--sk-text-muted);
  font-style: italic;
  padding: 0.25rem;
}

.sk-chat__form {
  display: flex;
  gap: 0.45rem;
  flex-shrink: 0;
}

.sk-chat__input {
  flex: 1;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid var(--sk-border-mid);
  background: rgba(255, 255, 255, 0.04);
  color: var(--sk-text);
  font-size: 0.82rem;
  padding: 0.5rem 0.65rem;
  outline: none;

  &:focus {
    border-color: rgba(124, 58, 237, 0.55);
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.sk-chat__send {
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  padding: 0.5rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
  color: white;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
