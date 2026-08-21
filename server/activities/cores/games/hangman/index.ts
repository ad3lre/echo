export * from './core';
import type { HangmanGuessHistoryEntry, HangmanPhase } from './core';

/** Per-viewer projection — secret never included; mask only during guessing. */
export interface HangmanView {
  roundSeq: number;
  setterUserId: string;
  rosterUserIds: string[];
  phase: HangmanPhase;
  guessedLetters: string[];
  guessHistory: HangmanGuessHistoryEntry[];
  wrongCount: number;
  mask: string | null;
  roundResult: 'won' | 'lost' | null;
  answerReveal: string | null;
  /** True when this viewer is the current round setter. */
  youAreSetter: boolean;
}

export const HANGMAN_ACTION = {
  commitWord: 'commit_word',
  guessLetter: 'guess_letter',
  nextRound: 'next_round',
} as const;

export type HangmanActionType =
  (typeof HANGMAN_ACTION)[keyof typeof HANGMAN_ACTION];

export interface HangmanCommitWordPayload {
  word: string;
}

export interface HangmanGuessLetterPayload {
  letter: string;
}

export interface HangmanNextRoundPayload {
  completedRoundSeq: number;
}
