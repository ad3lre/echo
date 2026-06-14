/**
 * Pure Wordline rules — shared by client and authoritative game server.
 * Relocated from `frontend/src/features/voice/wordline/wordlineGameCore.ts`.
 */

import { ANSWERS, LEVEL_WORDS, WORD_LENGTH } from './constants';

export type Mark = 'empty' | 'absent' | 'present' | 'correct';
export type GameStatus = 'playing' | 'won' | 'lost';
export type GameMode = 'daily' | 'levels';

export type WordlineSaveState = {
  dateKey: string;
  mode: GameMode;
  level: number;
  rows: string[];
  marks: Mark[][];
  current: string;
  status: GameStatus;
  solution?: string;
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

export function wordlineSolutionForMode(opts: {
  mode: GameMode;
  dateKey: string;
  level: number;
}): string {
  if (opts.mode === 'levels') {
    return LEVEL_WORDS[normalizeWordlineLevel(opts.level)] ?? 'crane';
  }
  return dailyWordlineAnswer(opts.dateKey);
}

export function utcDateKeyFromMs(now: number): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
