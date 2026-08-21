/** One word of the masked puzzle: a list of revealed letters or '_' blanks. */
export type PuzzleWord = {
  id: string;
  slots: string[];
};

/** A single resolved row in the per-round guess history. */
export type GuessLogRow = {
  userId: string;
  displayName: string;
  letter: string;
  hit: boolean;
};

/** A per-round "correct guesses" scoreboard entry for one roster user. */
export type HitScoreRow = {
  userId: string;
  displayName: string;
  pfpUrl: string;
  correctCount: number;
};
