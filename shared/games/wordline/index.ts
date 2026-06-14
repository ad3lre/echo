export * from './core';
export * from './constants';
import type { GameMode, GameStatus, Mark } from './core';

/** Per-viewer Wordline puzzle — solution redacted until game over. */
export interface WordlineView {
  dateKey: string;
  mode: GameMode;
  level: number;
  rows: string[];
  marks: Mark[][];
  current: string;
  status: GameStatus;
  /** Revealed only when status is `won` or `lost`. */
  solution: string | null;
}

export const WORDLINE_ACTION = {
  submitGuess: 'submit_guess',
  setMode: 'set_mode',
} as const;

export type WordlineActionType =
  (typeof WORDLINE_ACTION)[keyof typeof WORDLINE_ACTION];

export interface WordlineSubmitGuessPayload {
  guess: string;
}

export interface WordlineSetModePayload {
  mode: GameMode;
}
