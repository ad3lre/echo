import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { WordlineView } from '@shared/games/wordline';
import type { GameMode } from '@shared/games/wordline/core';
import { KEYBOARD_ROWS, WORD_LENGTH } from './wordlineConstants';
import { wordlineDailyCalendarKey } from './wordlineDailyCalendar';
import {
  createWordlineToast,
  focusWordlineTileColumn,
  handleWordlineKey,
  onWordlineDocKeydown,
  type WordlineDraftState,
} from './wordlineServerGameInput';
import { useWordlineServerGameDisplay } from './wordlineServerGameDisplay';
import { wordlineRoundOverToastMessage } from './wordlineServerGameRoundMessage';

export function useWordlineServerGame(opts: {
  wordlineView: ComputedRef<WordlineView | null>;
  submitWordlineGuess: (guess: string) => void;
  setWordlineMode: (mode: GameMode) => void;
  accountUserId: Ref<string | null | undefined>;
}) {
  const theme = ref<'light' | 'dark'>('dark');
  const draftCurrent = ref('');
  const cursorColumn = ref(0);
  const toastMessage = ref('');
  const statsOpen = ref(false);
  const draftState: WordlineDraftState = {
    draftCurrent,
    cursorColumn,
    toastMessage,
    messageTimer: { id: 0 },
  };

  const view = computed(() => opts.wordlineView.value);
  const display = useWordlineServerGameDisplay(
    view,
    draftCurrent,
    cursorColumn,
  );

  watch(view, (next, prev) => {
    if (!next) return;
    if (prev && next.rows.length > (prev.rows.length ?? 0)) {
      draftCurrent.value = '';
      cursorColumn.value = 0;
    }
    if (next.status !== 'playing' && prev?.status === 'playing') {
      createWordlineToast(draftState, wordlineRoundOverToastMessage(next));
    }
  });

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function toggleMode() {
    const v = view.value;
    const next = v?.mode === 'daily' ? 'levels' : 'daily';
    draftCurrent.value = '';
    cursorColumn.value = 0;
    opts.setWordlineMode(next);
    createWordlineToast(
      draftState,
      next === 'levels' ? 'Level mode.' : 'Daily mode.',
    );
  }

  function handleLevelAction() {
    const v = view.value;
    if (!v || v.mode !== 'levels') return;
    draftCurrent.value = '';
    cursorColumn.value = 0;
    opts.setWordlineMode('levels');
  }

  function selectCell(rowIndex: number, colIndex: number) {
    const v = view.value;
    if (!v || v.status !== 'playing') return;
    if (rowIndex !== v.rows.length || colIndex < 0 || colIndex >= WORD_LENGTH) {
      return;
    }
    focusWordlineTileColumn(draftState, colIndex);
  }

  function copyShareGrid() {
    /* stats/share are local-only; server mode has no persisted stats yet */
  }

  const onDocKeydown = (e: KeyboardEvent) =>
    onWordlineDocKeydown(view, draftState, opts.submitWordlineGuess, e);

  const handleKey = (key: string) =>
    handleWordlineKey(view, draftState, opts.submitWordlineGuess, key);

  onMounted(() => {
    window.addEventListener('keydown', onDocKeydown);
    if (!view.value) {
      createWordlineToast(draftState, 'Connecting to game server…');
    }
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onDocKeydown);
    window.clearTimeout(draftState.messageTimer.id);
  });

  return reactive({
    theme,
    state: display.state,
    dayKey: computed(() => view.value?.dateKey ?? wordlineDailyCalendarKey()),
    dictionaryReady: computed(() => !!view.value),
    toastMessage,
    statsOpen,
    KEYBOARD_ROWS,
    displayRows: display.displayRows,
    cursorColumn,
    activeGuessRowIndex: display.activeGuessRowIndex,
    caretHighlightColumn: display.caretHighlightColumn,
    selectCell,
    keyMarks: display.keyMarks,
    modeEyebrow: display.modeEyebrow,
    roundLabel: display.roundLabel,
    progressLabel: display.progressLabel,
    showLevelAction: display.showLevelAction,
    levelActionLabel: display.levelActionLabel,
    statsModel: display.statsModel,
    handleKey,
    toggleTheme,
    toggleMode,
    handleLevelAction,
    copyShareGrid,
  });
}
