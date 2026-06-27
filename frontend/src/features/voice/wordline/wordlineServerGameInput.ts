import type { ComputedRef, Ref } from 'vue';
import type { WordlineView } from '@shared/games/wordline';
import { WORD_LENGTH } from './wordlineConstants';

export type WordlineDraftState = {
  draftCurrent: Ref<string>;
  cursorColumn: Ref<number>;
  toastMessage: Ref<string>;
  messageTimer: { id: number };
};

export function createWordlineToast(
  state: WordlineDraftState,
  message: string,
): void {
  window.clearTimeout(state.messageTimer.id);
  state.toastMessage.value = message;
  state.messageTimer.id = window.setTimeout(() => {
    state.toastMessage.value = '';
  }, 1800);
}

export function focusWordlineTileColumn(
  state: WordlineDraftState,
  col: number,
) {
  const L = state.draftCurrent.value.length;
  if (L < WORD_LENGTH) {
    state.cursorColumn.value = Math.min(Math.max(0, col), L);
  } else {
    state.cursorColumn.value = Math.min(Math.max(0, col), WORD_LENGTH - 1);
  }
}

export function insertWordlineLetter(
  view: ComputedRef<WordlineView | null>,
  state: WordlineDraftState,
  ch: string,
): void {
  const v = view.value;
  if (!v || v.status !== 'playing') return;
  const letter = ch.toLowerCase();
  if (!/^[a-z]$/.test(letter)) return;
  const L0 = state.draftCurrent.value.length;
  if (L0 < WORD_LENGTH) {
    let c = state.cursorColumn.value;
    c = Math.min(Math.max(0, c), L0);
    state.draftCurrent.value =
      state.draftCurrent.value.slice(0, c) +
      letter +
      state.draftCurrent.value.slice(c);
    state.draftCurrent.value = state.draftCurrent.value.slice(0, WORD_LENGTH);
    state.cursorColumn.value = Math.min(c + 1, state.draftCurrent.value.length);
  } else {
    let c = state.cursorColumn.value;
    c = Math.min(Math.max(0, c), WORD_LENGTH - 1);
    state.draftCurrent.value =
      state.draftCurrent.value.slice(0, c) +
      letter +
      state.draftCurrent.value.slice(c + 1);
    state.cursorColumn.value = Math.min(c + 1, WORD_LENGTH);
  }
}

export function backspaceWordlineDraft(state: WordlineDraftState): void {
  const s = state.draftCurrent.value;
  if (!s.length) return;
  const c = state.cursorColumn.value;
  if (c <= 0) return;
  state.draftCurrent.value = s.slice(0, c - 1) + s.slice(c);
  state.cursorColumn.value = c - 1;
}

export function submitWordlineDraftGuess(
  view: ComputedRef<WordlineView | null>,
  state: WordlineDraftState,
  submitGuess: (guess: string) => void,
): void {
  const v = view.value;
  if (!v) {
    createWordlineToast(state, 'Connecting to game server…');
    return;
  }
  if (v.status !== 'playing') {
    createWordlineToast(
      state,
      v.status === 'won'
        ? 'Already solved.'
        : `Answer: ${(v.solution ?? '').toUpperCase()}`,
    );
    return;
  }
  if (state.draftCurrent.value.length !== WORD_LENGTH) {
    createWordlineToast(state, 'Not enough letters.');
    return;
  }
  submitGuess(state.draftCurrent.value);
}

export function handleWordlineKey(
  view: ComputedRef<WordlineView | null>,
  state: WordlineDraftState,
  submitGuess: (guess: string) => void,
  key: string,
): void {
  const v = view.value;
  if (!v || v.status !== 'playing') return;
  if (key === 'Backspace') {
    backspaceWordlineDraft(state);
    return;
  }
  if (key === 'Enter') {
    submitWordlineDraftGuess(view, state, submitGuess);
    return;
  }
  if (/^[a-zA-Z]$/.test(key)) insertWordlineLetter(view, state, key);
}

export function onWordlineDocKeydown(
  view: ComputedRef<WordlineView | null>,
  state: WordlineDraftState,
  submitGuess: (guess: string) => void,
  e: KeyboardEvent,
): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Enter') {
    e.preventDefault();
    submitWordlineDraftGuess(view, state, submitGuess);
    return;
  }
  if (k === 'Backspace') {
    e.preventDefault();
    handleWordlineKey(view, state, submitGuess, 'Backspace');
    return;
  }
  if (k === 'ArrowLeft') {
    e.preventDefault();
    state.cursorColumn.value = Math.max(state.cursorColumn.value - 1, 0);
    return;
  }
  if (k === 'ArrowRight') {
    e.preventDefault();
    const L = state.draftCurrent.value.length;
    const maxPos = L < WORD_LENGTH ? L : WORD_LENGTH;
    state.cursorColumn.value = Math.min(state.cursorColumn.value + 1, maxPos);
    return;
  }
  if (k.length === 1 && /^[a-zA-Z]$/.test(k)) {
    e.preventDefault();
    handleWordlineKey(view, state, submitGuess, k);
  }
}
