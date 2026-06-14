export * from './core';
import type { TttCell, TttTerminal } from './core';

/** Pending PvP invite visible only to the recipient (`serializeFor` redaction). */
export interface TttPendingInvite {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
}

/**
 * Per-viewer projection the client renders (the server's `serializeFor` output).
 * TTT has no hidden board state; `youAre` and `pendingInvite` are per-viewer.
 */
export interface TttView {
  board: TttCell[];
  status: TttTerminal;
  xUserId: string;
  oUserId: string;
  currentTurn: 'X' | 'O';
  /** Both seats filled — a move is possible. */
  ready: boolean;
  /** This viewer's mark, or null when spectating. */
  youAre: 'X' | 'O' | null;
  /** Set only for the challenged user while a match has not started. */
  pendingInvite: TttPendingInvite | null;
}

export const TTT_ACTION = {
  place: 'place',
  rematch: 'rematch',
  challenge: 'challenge',
  acceptInvite: 'accept_invite',
  declineInvite: 'decline_invite',
} as const;
export type TttActionType = (typeof TTT_ACTION)[keyof typeof TTT_ACTION];

export interface TttPlacePayload {
  cell: number;
}

export interface TttChallengePayload {
  toUserId: string;
}
