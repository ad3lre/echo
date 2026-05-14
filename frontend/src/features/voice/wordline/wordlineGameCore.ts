import {
  ANSWERS,
  LEVEL_WORDS,
  WORD_LENGTH,
} from '@/features/voice/wordline/wordlineConstants';

export type Mark = 'empty' | 'absent' | 'present' | 'correct';
export type GameStatus = 'playing' | 'won' | 'lost';
export type GameMode = 'daily' | 'levels';

export type SaveState = {
  dateKey: string;
  mode: GameMode;
  level: number;
  rows: string[];
  marks: Mark[][];
  current: string;
  status: GameStatus;
  solution?: string;
};

export type Stats = {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  distribution: number[];
  playedDates: string[];
};

export function scoreWordlineGuess(guess: string, solution: string): Mark[] {
  const g = guess.toLowerCase().split('');
  const s = solution.toLowerCase().split('');
  const result: Mark[] = Array(WORD_LENGTH).fill('absent');
  const remaining = new Map<string, number>();
  for (let index = 0; index < WORD_LENGTH; index++) {
    if (g[index] === s[index]) result[index] = 'correct';
    else remaining.set(s[index]!, (remaining.get(s[index]!) ?? 0) + 1);
  }
  for (let index = 0; index < WORD_LENGTH; index++) {
    if (result[index] === 'correct') continue;
    const ch = g[index]!;
    const count = remaining.get(ch) ?? 0;
    if (count > 0) {
      result[index] = 'present';
      remaining.set(ch, count - 1);
    }
  }
  return result;
}

export function dailyWordlineAnswer(dateKey: string): string {
  const parts = dateKey.split('-').map((p) => Number(p));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const today = Date.UTC(y, m - 1, d);
  const start = Date.UTC(2021, 5, 19);
  const index = Math.floor((today - start) / 86_400_000) % ANSWERS.length;
  return ANSWERS[(index + ANSWERS.length) % ANSWERS.length] ?? 'crane';
}

export function normalizeWordlineLevel(level: number): number {
  return (
    ((level % LEVEL_WORDS.length) + LEVEL_WORDS.length) % LEVEL_WORDS.length
  );
}

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
