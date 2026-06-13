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

<style scoped lang="scss">
/* ── Manual letter input (click + physical keyboard) ─────────── */
.hm-type-guess {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  max-width: min(26rem, 100%);
  margin-inline: auto;
  padding: 0.62rem 0.85rem;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: linear-gradient(180deg, #12102a 0%, #0c0a1c 100%);
  color: rgba(240, 232, 255, 0.9);
  cursor: text;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.hm-type-guess:hover:not(.hm-type-guess--disabled) {
  border-color: rgba(167, 139, 250, 0.45);
  background: linear-gradient(180deg, #18152f 0%, #100e22 100%);
}

.hm-type-guess--focused {
  border-style: solid;
  border-color: rgba(167, 139, 250, 0.65);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.18);
}

.hm-type-guess--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hm-type-guess__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: text;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  caret-color: transparent;
}

.hm-type-guess__input:focus {
  outline: none;
}

.hm-type-guess__icon {
  display: flex;
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  color: rgba(196, 181, 253, 0.85);
}

.hm-type-guess__icon svg {
  width: 100%;
  height: 100%;
}

.hm-type-guess__label {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  pointer-events: none;
}

.hm-type-guess__title {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.hm-type-guess__hint {
  font-size: 0.72rem;
  color: rgba(240, 232, 255, 0.55);
}

/* ── Keyboard ────────────────────────────────────────────────── */
.hm-sync-stall {
  width: 100%;
  max-width: min(26rem, 100%);
  margin-inline: auto;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  font-size: 0.74rem;
  line-height: 1.35;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.hm-keyboard {
  --hm-key-gap: clamp(0.14rem, 1.2vw, 0.32rem);
  --hm-key-count: 10;

  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.45rem;
  padding: 0.85rem max(0.35rem, env(safe-area-inset-left, 0px)) 1rem
    max(0.35rem, env(safe-area-inset-right, 0px));
  border-top: 1px solid var(--hm-border);
  flex-shrink: 0;
}

.hm-key-row {
  display: flex;
  gap: var(--hm-key-gap);
  justify-content: center;
  flex-wrap: nowrap;
  width: 100%;
  max-width: min(26rem, 100%);
  margin-inline: auto;
}

/* Premium 3D keycap — fluid width so 10-letter row fits narrow phones */
.hm-key {
  --hm-keys: var(--hm-key-count, 10);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: 0;
  width: calc(
    (100% - (var(--hm-keys) - 1) * var(--hm-key-gap)) / var(--hm-keys)
  );
  max-width: 2.45rem;
  min-height: clamp(2.35rem, 9vw + 1.1rem, 2.75rem);
  height: clamp(2.35rem, 9vw + 1.1rem, 2.75rem);
  padding: 0;
  border-radius: 7px;
  font-size: clamp(0.62rem, 2.1vw + 0.35rem, 0.88rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  /* Key face */
  background: linear-gradient(180deg, #1c1836 0%, #14112c 100%);
  color: rgba(240, 232, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* 3D depth: bottom shadow = key bottom face */
  box-shadow:
    0 4px 0 0 var(--hm-key-depth),
    0 5px 10px rgba(0, 0, 0, 0.45);
  transform: translateY(0);
  transition:
    transform 55ms ease,
    box-shadow 55ms ease,
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.hm-key:hover:not(:disabled) {
  background: linear-gradient(180deg, #241f48 0%, #1c1838 100%);
  transform: translateY(-2px);
  box-shadow:
    0 6px 0 0 var(--hm-key-depth),
    0 8px 14px rgba(0, 0, 0, 0.5);
}

.hm-key:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow:
    0 0 0 0 var(--hm-key-depth),
    0 1px 4px rgba(0, 0, 0, 0.35);
}

.hm-key:disabled {
  cursor: default;
}

.hm-key--fresh {
  animation: hm-key-press 0.22s ease-out;
}

.hm-key--hit {
  background: linear-gradient(180deg, #0d3d2a 0%, #092a1c 100%);
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
  box-shadow:
    0 4px 0 0 #020f09,
    0 0 14px rgba(16, 185, 129, 0.2),
    0 5px 10px rgba(0, 0, 0, 0.45);
}

.hm-key--miss {
  background: linear-gradient(180deg, #280e16 0%, #1a0810 100%);
  border-color: rgba(244, 63, 94, 0.22);
  color: rgba(252, 165, 165, 0.45);
  box-shadow:
    0 4px 0 0 #0a0206,
    0 5px 10px rgba(0, 0, 0, 0.4);
  opacity: 0.6;
}

@keyframes hm-key-press {
  0% {
    transform: translateY(4px);
    box-shadow:
      0 0 0 0 var(--hm-key-depth),
      0 1px 4px rgba(0, 0, 0, 0.35);
  }
  60% {
    transform: translateY(-1px);
  }
  100% {
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hm-key--fresh {
    animation: none;
  }
}

/* ── Light theme overrides ───────────────────────────────────── */
[data-theme='light'] .hm-type-guess {
  background: linear-gradient(180deg, #ffffff 0%, #f4f2fc 100%);
  border-color: rgba(0, 0, 0, 0.14);
  color: var(--hm-text);
}

[data-theme='light'] .hm-type-guess:hover:not(.hm-type-guess--disabled) {
  border-color: rgba(109, 40, 217, 0.35);
}

[data-theme='light'] .hm-type-guess--focused {
  border-color: rgba(109, 40, 217, 0.55);
  box-shadow: 0 0 0 2px rgba(109, 40, 217, 0.12);
}

[data-theme='light'] .hm-type-guess__hint {
  color: var(--hm-text-muted);
}

[data-theme='light'] .hm-key {
  background: linear-gradient(180deg, #f0eeff 0%, #e4e0f8 100%);
  color: #2a2548;
  border-color: rgba(0, 0, 0, 0.14);
  box-shadow:
    0 4px 0 0 var(--hm-key-depth),
    0 5px 10px rgba(0, 0, 0, 0.1);
}

[data-theme='light'] .hm-key:hover:not(:disabled) {
  background: linear-gradient(180deg, #ffffff 0%, #ece8ff 100%);
}

[data-theme='light'] .hm-key--hit {
  background: linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%);
  border-color: rgba(16, 185, 129, 0.4);
  color: #065f46;
  box-shadow:
    0 4px 0 0 #6ee7b7,
    0 5px 10px rgba(16, 185, 129, 0.15);
}

[data-theme='light'] .hm-key--miss {
  background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%);
  border-color: rgba(244, 63, 94, 0.3);
  color: rgba(159, 18, 57, 0.5);
  box-shadow:
    0 4px 0 0 #fca5a5,
    0 5px 10px rgba(244, 63, 94, 0.1);
}
</style>
