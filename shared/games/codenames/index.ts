export * from './core';
export * from './wordBank';
import type {
  CodenamesAffiliation,
  CodenamesPublicCell,
  CodenamesRoleAssignment,
  CodenamesSnapshot,
} from './types';

/** Per-viewer projection — spymaster key redacted for operatives. */
export interface CodenamesView extends CodenamesSnapshot {
  /** Full board key; set only for spymaster viewers while playing. */
  spymasterKey: CodenamesAffiliation[] | null;
  youAreSpymaster: boolean;
  youAreOperative: boolean;
  youAreOrchestrator: boolean;
}

export const CODENAMES_ACTION = {
  setup: 'setup',
  deal: 'deal',
  clue: 'clue',
  reveal: 'reveal',
  endTurn: 'end_turn',
  newGame: 'new_game',
} as const;

export type CodenamesActionType =
  (typeof CODENAMES_ACTION)[keyof typeof CODENAMES_ACTION];

export interface CodenamesSetupPayload {
  roleAssignments: CodenamesRoleAssignment[];
}

export interface CodenamesCluePayload {
  word: string;
  number: number;
}

export interface CodenamesRevealPayload {
  cardIndex: number;
}

export interface CodenamesNewGamePayload {
  completedGameSeq: number;
}
