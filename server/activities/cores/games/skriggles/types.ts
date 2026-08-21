/** Skriggles — shared types (no LiveKit codec deps). */

export type SkrigglesSettings = {
  rounds: number;
  drawTimeSec: number;
  wordPickSec: number;
  minWordLen: number;
  hints: boolean;
  language: string;
  customWords: string;
};

export type SkrigglesChatEntry = {
  kind: 'guess' | 'close' | 'correct' | 'system';
  userId: string;
  text: string;
  at: number;
  points?: number;
};

export type SkrigglesRoundResult = {
  word: string;
  guessers: { userId: string; points: number }[];
};

export type SkrigglesPhase =
  | 'lobby'
  | 'word_pick'
  | 'drawing'
  | 'round_reveal'
  | 'game_over';

export type SkrigglesSnapshot = {
  roundSeq: number;
  rosterUserIds: string[];
  phase: SkrigglesPhase;
  settings: SkrigglesSettings;
  scores: Record<string, number>;
  drawerUserId: string;
  wordChoices: [string, string, string] | null;
  wordHint: string | null;
  phaseEndsAt: number | null;
  chatLog: SkrigglesChatEntry[];
  roundResult: SkrigglesRoundResult | null;
  canvasStrokeSeq: number;
  correctGuessersThisRound: string[];
  hintRevealed: boolean;
};

export type SkrigglesTick = { updatedAt: number; revision: number };

export type SkrigglesGuessMatch = 'exact' | 'close' | 'wrong';

export type SkrigglesGuessOutcome = {
  match: SkrigglesGuessMatch;
  chatEntry: SkrigglesChatEntry;
  scores: Record<string, number>;
  correctGuessersThisRound: string[];
  phase: SkrigglesPhase;
  roundResult: SkrigglesRoundResult | null;
  wordHint: string | null;
  hintRevealed: boolean;
};
