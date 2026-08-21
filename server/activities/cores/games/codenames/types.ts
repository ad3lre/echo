/** Codenames — shared types (no LiveKit codec deps). */

export type CodenamesAffiliation = 'red' | 'blue' | 'neutral' | 'assassin';

export type CodenamesPublicCell =
  | { revealed: false; word: string }
  | {
      revealed: true;
      word: string;
      affiliation: CodenamesAffiliation;
    };

export type CodenamesRoleAssignment = {
  userId: string;
  team: 'red' | 'blue';
  role: 'spymaster' | 'operative';
};

export type CodenamesPhase =
  | 'lobby'
  | 'playing'
  | 'game_over'
  | 'paused_requires_new_game';

export type CodenamesTurnStage = 'await_clue' | 'await_guess' | 'na';

/** Authoritative snapshot fields (no transport metadata). */
export type CodenamesSnapshot = {
  gameSeq: number;
  rosterUserIds: string[];
  phase: CodenamesPhase;
  turnStage: CodenamesTurnStage;
  cells: CodenamesPublicCell[];
  startingTeam: 'red' | 'blue';
  currentTeam: 'red' | 'blue';
  winner: 'red' | 'blue' | null;
  currentClue: { word: string; number: number } | null;
  guessesRemaining: number;
  roleAssignments: CodenamesRoleAssignment[];
  lastEvent?: string;
};

export type CodenamesTick = { updatedAt: number; revision: number };
