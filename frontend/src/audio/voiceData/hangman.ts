/** One Hangman letter guess in order (parallel to {@link EchoHangmanActivityV1.guessedLetters}). */
export type EchoHangmanGuessHistoryEntryV1 = {
  userId: string;
  letter: string;
};

/** Guild VC Hangman — activity snapshot shape (game-server or legacy P2P). */
export type EchoHangmanActivityV1 = {
  v: 1;
  t: 'hangman_activity';
  updatedAt: number;
  /** Monotonic per setter for same-ms ordering (integer ≥ 0). */
  revision: number;
  fromUserId: string;
  roundSeq: number;
  setterUserId: string;
  rosterUserIds: string[];
  phase: 'setter_picking' | 'guessing' | 'round_over';
  guessedLetters: string[];
  /** Same length as {@link guessedLetters} when present; `userId` empty means unknown / legacy. */
  guessHistory: EchoHangmanGuessHistoryEntryV1[];
  wrongCount: number;
  mask: string | null;
  roundResult: 'won' | 'lost' | null;
  answerReveal: string | null;
};

export type EchoHangmanGuessIntentV1 = {
  v: 1;
  t: 'hangman_guess_intent';
  updatedAt: number;
  fromUserId: string;
  roundSeq: number;
  letter: string;
};

/**
 * Setter → orchestrator (LiveKit `destinationIdentities`) so the roster host can
 * apply letter guesses when the setter’s client is flaky or offline.
 */
export type EchoHangmanRoundSecretV1 = {
  v: 1;
  t: 'hangman_round_secret';
  updatedAt: number;
  roundSeq: number;
  setterUserId: string;
  /** Normalized A–Z phrase (same rules as Hangman commit). */
  secret: string;
};

export type EchoHangmanNextRoundV1 = {
  v: 1;
  t: 'hangman_next_round';
  updatedAt: number;
  fromUserId: string;
  /** Must match current shared `roundSeq` when phase is `round_over`. */
  completedRoundSeq: number;
};
