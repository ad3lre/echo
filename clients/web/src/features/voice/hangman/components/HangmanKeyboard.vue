<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  /** True while this user may guess (guessing phase and not the setter). */
  canType: boolean;
  guessedLetters: readonly string[];
  mask: string;
  lastGuess: string | null;
  syncStalled: boolean;
}>();

const emit = defineEmits<{ guess: [letter: string] }>();

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const guessInputEl = ref<HTMLInputElement | null>(null);
const guessInputFocused = ref(false);

const guessed = computed(() => {
  const o: Record<string, true> = {};
  for (const x of props.guessedLetters) o[x] = true;
  return o;
});

/** Emit a normalized A–Z guess; the parent owns dedupe/sync gating. */
function emitGuess(ch: string): void {
  if (!props.canType) return;
  const c = ch.toUpperCase();
  if (!/^[A-Z]$/.test(c)) return;
  emit('guess', c);
}

function keyButtonClass(ch: string): string {
  const c = ch.toUpperCase();
  if (!guessed.value[c]) return '';
  return props.mask.includes(c) ? 'hm-key--hit' : 'hm-key--miss';
}

function keyButtonLabel(ch: string): string {
  const c = ch.toUpperCase();
  if (!guessed.value[c]) return `Guess ${c}`;
  return props.mask.includes(c) ? `${c} was correct` : `${c} was a miss`;
}

/** Avoid hijacking letters while the user is typing elsewhere (e.g. chat). */
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  const host = el.closest('textarea, select, input, [contenteditable]');
  if (host instanceof HTMLTextAreaElement || host instanceof HTMLSelectElement)
    return true;
  if (host instanceof HTMLInputElement) {
    const nonTyping = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !nonTyping.has(host.type.toLowerCase());
  }
  if (host instanceof HTMLElement && host.isContentEditable) return true;
  return false;
}

function clearGuessInputField(): void {
  const el = guessInputEl.value;
  if (el) el.value = '';
}

function focusGuessInput(): void {
  if (!props.canType) return;
  guessInputEl.value?.focus();
}

function onGuessInputFocus(): void {
  guessInputFocused.value = true;
}

function onGuessInputBlur(): void {
  guessInputFocused.value = false;
  clearGuessInputField();
}

function applyTypedGuess(raw: string): void {
  const c = raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(-1);
  if (!c) return;
  emitGuess(c);
  clearGuessInputField();
}

function onGuessInput(e: Event): void {
  if (!props.canType) return;
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  applyTypedGuess(el.value);
}

function onGuessInputKeydown(e: KeyboardEvent): void {
  if (!props.canType) return;
  if (e.key === 'Escape') {
    guessInputEl.value?.blur();
    return;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    return;
  }
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    emitGuess(e.key);
    clearGuessInputField();
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isEditableKeyboardTarget(e.target)) return;
  const k = e.key;
  if (k.length === 1 && /^[a-zA-Z]$/.test(k)) {
    if (!props.canType) return;
    e.preventDefault();
    emitGuess(k);
  }
}

watch(
  () => props.canType,
  (allowed) => {
    if (!allowed) {
      guessInputEl.value?.blur();
      guessInputFocused.value = false;
    }
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  guessInputEl.value?.blur();
});
</script>

<template>
  <div class="hm-keyboard">
    <p v-if="syncStalled" class="hm-sync-stall" role="status">
      Guess didn’t sync — check voice connection or wait for the roster host.
      Try again or use the letter box below.
    </p>
    <div
      class="hm-type-guess"
      :class="{
        'hm-type-guess--focused': guessInputFocused,
        'hm-type-guess--disabled': !canType,
      }"
      role="group"
      :aria-label="
        guessInputFocused
          ? 'Type a letter guess on your keyboard'
          : 'Click to type a letter guess on your keyboard'
      "
      @click="focusGuessInput"
    >
      <input
        ref="guessInputEl"
        type="text"
        inputmode="text"
        maxlength="8"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        enterkeyhint="done"
        class="hm-type-guess__input"
        :disabled="!canType"
        :tabindex="canType ? 0 : -1"
        aria-label="Letter guess"
        @focus="onGuessInputFocus"
        @blur="onGuessInputBlur"
        @input="onGuessInput"
        @keydown="onGuessInputKeydown"
      />
      <span class="hm-type-guess__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect
            x="2"
            y="6"
            width="20"
            height="12"
            rx="2"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path
            d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <span class="hm-type-guess__label">
        <span class="hm-type-guess__title">{{
          guessInputFocused ? 'Typing…' : 'Type a letter'
        }}</span>
        <span class="hm-type-guess__hint">{{
          guessInputFocused
            ? 'Press A–Z · Esc to leave'
            : 'Click here, then use your keyboard'
        }}</span>
      </span>
    </div>
    <div
      v-for="(row, ri) in KEYBOARD_ROWS"
      :key="'kr-' + ri"
      class="hm-key-row"
      :style="{ '--hm-key-count': String(row.length) }"
    >
      <button
        v-for="k in row"
        :key="k"
        type="button"
        class="hm-key"
        :class="[keyButtonClass(k), { 'hm-key--fresh': k === lastGuess }]"
        :disabled="!!guessed[k]"
        :aria-label="keyButtonLabel(k)"
        :title="keyButtonLabel(k)"
        @click="emitGuess(k)"
      >
        {{ k }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/HangmanKeyboard.scss"></style>
