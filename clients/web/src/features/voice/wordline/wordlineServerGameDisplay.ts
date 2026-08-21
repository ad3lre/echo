import { computed, type ComputedRef, type Ref } from 'vue';
import type { WordlineView } from '@shared/games/wordline';
import type { GameMode, Mark } from '@shared/games/wordline/core';
import { LEVEL_WORDS, MAX_GUESSES, WORD_LENGTH } from './wordlineConstants';
import {
  formatWordlineDateLabel,
  markStrength,
  wordlineLevelProgress,
} from './wordlineGameCore';

export function useWordlineServerGameDisplay(
  view: ComputedRef<WordlineView | null>,
  draftCurrent: Ref<string>,
  cursorColumn: Ref<number>,
) {
  const displayRows = computed(() => {
    const v = view.value;
    const rows: string[] = v ? [...v.rows] : [];
    const marks = v ? [...v.marks] : [];
    if (v?.status === 'playing' && rows.length < MAX_GUESSES) {
      rows.push(draftCurrent.value);
    }
    const out: { letter: string; mark: Mark; filled: boolean }[][] = [];
    for (let rowIndex = 0; rowIndex < MAX_GUESSES; rowIndex++) {
      const guess = (rows[rowIndex] ?? '').slice(0, WORD_LENGTH);
      const rowMarks = marks[rowIndex] ?? [];
      const rowCells = [];
      for (let j = 0; j < WORD_LENGTH; j++) {
        const letter = guess[j] ?? '';
        const mark = (rowMarks[j] ?? 'empty') as Mark;
        rowCells.push({ letter, mark, filled: letter.length > 0 });
      }
      out.push(rowCells);
    }
    return out;
  });

  const activeGuessRowIndex = computed(() => {
    const v = view.value;
    return v?.status === 'playing' ? v.rows.length : -1;
  });

  const caretHighlightColumn = computed(() => {
    const L = draftCurrent.value.length;
    if (L < WORD_LENGTH) return Math.min(cursorColumn.value, L);
    return Math.min(cursorColumn.value, WORD_LENGTH - 1);
  });

  const keyMarks = computed(() => {
    const v = view.value;
    const m = new Map<string, Mark>();
    if (!v) return m;
    v.rows.forEach((guess, rowIndex) => {
      guess.split('').forEach((letter, index) => {
        const mark = v.marks[rowIndex]?.[index] ?? 'empty';
        const prev = m.get(letter.toLowerCase()) ?? 'empty';
        if (markStrength(mark) > markStrength(prev)) {
          m.set(letter.toLowerCase(), mark);
        }
      });
    });
    return m;
  });

  const state = computed(() => {
    const v = view.value;
    return {
      mode: (v?.mode ?? 'daily') as GameMode,
      status: v?.status ?? ('playing' as const),
      level: v?.level ?? 0,
    };
  });

  const modeEyebrow = computed(() =>
    state.value.mode === 'daily' ? 'Daily word' : 'Level run',
  );

  const roundLabel = computed(() => {
    const v = view.value;
    if (!v) return 'Connecting…';
    return v.mode === 'daily'
      ? formatWordlineDateLabel(v.dateKey)
      : `Level ${v.level + 1} of ${LEVEL_WORDS.length}`;
  });

  const progressLabel = computed(() => {
    const v = view.value;
    if (!v) return 'Join voice to sync';
    return v.mode === 'daily'
      ? '6 tries'
      : `${wordlineLevelProgress({
          mode: v.mode,
          status: v.status,
          level: v.level,
        })} solved`;
  });

  const showLevelAction = computed(
    () => state.value.mode === 'levels' && state.value.status !== 'playing',
  );

  const levelActionLabel = computed(() =>
    state.value.status === 'lost' ? 'Try again' : 'Next level',
  );

  const statsModel = computed(() => ({
    stats: {
      played: 0,
      wins: 0,
      streak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0],
      playedDates: [],
    },
    winRate: 0,
    max: 1,
  }));

  return {
    displayRows,
    activeGuessRowIndex,
    caretHighlightColumn,
    keyMarks,
    state,
    modeEyebrow,
    roundLabel,
    progressLabel,
    showLevelAction,
    levelActionLabel,
    statsModel,
  };
}
