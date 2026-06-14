export * from './core';
import type { SkrigglesSnapshot } from './types';

/** Per-viewer projection — round secret never included. */
export interface SkrigglesView extends SkrigglesSnapshot {
  youAreDrawer: boolean;
  youAreOrchestrator: boolean;
}

export const SKRIGGLES_ACTION = {
  start: 'start',
  settings: 'settings',
  wordChoice: 'word_choice',
  guess: 'guess',
  nextRound: 'next_round',
  strokeBatch: 'stroke_batch',
  canvasCmd: 'canvas_cmd',
  canvasSnapshot: 'canvas_snapshot',
} as const;

export type SkrigglesActionType =
  (typeof SKRIGGLES_ACTION)[keyof typeof SKRIGGLES_ACTION];

export interface SkrigglesSettingsPayload {
  settings: Partial<SkrigglesSnapshot['settings']>;
}

export interface SkrigglesWordChoicePayload {
  word: string;
}

export interface SkrigglesGuessPayload {
  guess: string;
}

export interface SkrigglesNextRoundPayload {
  completedRoundSeq: number;
}

export interface SkrigglesRelayPayload {
  roundSeq: number;
  payload: unknown;
}

export const SKRIGGLES_RELAY_KIND = 'relay' as const;
