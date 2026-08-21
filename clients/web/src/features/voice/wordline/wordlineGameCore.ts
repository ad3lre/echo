export type {
  Mark,
  GameStatus,
  GameMode,
  WordlineSaveState,
} from '@shared/games/wordline/core';
export type { WordlineSaveState as SaveState } from '@shared/games/wordline/core';
export {
  scoreWordlineGuess,
  dailyWordlineAnswer,
  normalizeWordlineLevel,
} from '@shared/games/wordline/core';

import type { GameMode, GameStatus, Mark } from '@shared/games/wordline/core';
import { LEVEL_WORDS } from '@shared/games/wordline/constants';

export function wordlineLevelProgress(opts: {
  mode: GameMode;
  status: GameStatus;
  level: number;
}): string {
  const solved =
    opts.mode === 'levels' && opts.status === 'won'
      ? opts.level + 1
      : opts.level;
  return `${solved}/${LEVEL_WORDS.length}`;
}

export function wordlineWinMessage(opts: {
  mode: GameMode;
  status: GameStatus;
  level: number;
}): string {
  if (opts.mode === 'daily') return 'Clean solve.';
  if (opts.status === 'won' && opts.level + 1 === LEVEL_WORDS.length)
    return 'Run complete.';
  return 'Level cleared.';
}

export function markStrength(mark: Mark): number {
  return { empty: 0, absent: 1, present: 2, correct: 3 }[mark];
}

export function formatWordlineDateLabel(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return dateKey;
  }
  const [y, m, d] = parts as [number, number, number];
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d, 12, 0, 0, 0));
}

export type Stats = {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  distribution: number[];
  playedDates: string[];
};
