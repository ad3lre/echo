import {
  EMPTY_BOARD,
  applyMoveIfLegal,
  nextTurnAfter,
  terminalFromBoard,
  type TttCell,
  type TttTerminal,
} from '../../../../shared/games/ticTacToe/core';
import {
  TTT_ACTION,
  type TttChallengePayload,
  type TttPendingInvite,
  type TttPlacePayload,
  type TttView,
} from '../../../../shared/games/ticTacToe';
import type { GameModule } from '../../core/GameModule';

interface TttState {
  board: TttCell[];
  xUserId: string;
  oUserId: string;
  currentTurn: 'X' | 'O';
  status: TttTerminal;
  pendingInvite: TttPendingInvite | null;
}

function markOf(state: TttState, userId: string): 'X' | 'O' | null {
  if (userId && userId === state.xUserId) return 'X';
  if (userId && userId === state.oUserId) return 'O';
  return null;
}

function freshMatch(seats?: { x?: string; o?: string }): TttState {
  return {
    board: [...EMPTY_BOARD],
    xUserId: seats?.x ?? '',
    oUserId: seats?.o ?? '',
    currentTurn: 'X',
    status: 'playing',
    pendingInvite: null,
  };
}

function matchIdle(state: TttState): boolean {
  return !state.xUserId && !state.oUserId && state.status === 'playing';
}

function rosterHas(roster: readonly string[], userId: string): boolean {
  const id = userId.trim();
  return !!id && roster.some((r) => r.trim() === id);
}

/**
 * Authoritative tic-tac-toe. Matches start via targeted challenge/accept; seated
 * players play with server-validated turns. Replaces the old client roster-arbiter.
 */
export const ticTacToeModule: GameModule<TttState, TttView> = {
  key: 'tic_tac_toe',
  tickHz: 0,

  createInitialState: () => freshMatch(),

  onJoin: () => null,

  onLeave: (state, userId) => {
    const mark = markOf(state, userId);
    if (mark) {
      return freshMatch(
        mark === 'X' ? { o: state.oUserId } : { x: state.xUserId },
      );
    }
    if (state.pendingInvite?.fromUserId === userId) {
      return { ...state, pendingInvite: null };
    }
    if (state.pendingInvite?.toUserId === userId) {
      return { ...state, pendingInvite: null };
    }
    return null;
  },

  reduce: (state, payload, ctx) => {
    if (ctx.type === TTT_ACTION.challenge) {
      if (!matchIdle(state) || state.pendingInvite) return null;
      const to = (payload as TttChallengePayload | undefined)?.toUserId?.trim();
      if (!to || to === ctx.userId) return null;
      if (!rosterHas(ctx.roster, to)) return null;
      const invite: TttPendingInvite = {
        inviteId: `ttt-${ctx.userId}-${to}-${ctx.now}`,
        fromUserId: ctx.userId,
        toUserId: to,
      };
      return { ...state, pendingInvite: invite };
    }

    if (ctx.type === TTT_ACTION.acceptInvite) {
      const inv = state.pendingInvite;
      if (!inv || inv.toUserId !== ctx.userId) return null;
      return {
        ...freshMatch({ x: inv.fromUserId, o: inv.toUserId }),
        pendingInvite: null,
      };
    }

    if (ctx.type === TTT_ACTION.declineInvite) {
      const inv = state.pendingInvite;
      if (!inv) return null;
      if (inv.toUserId !== ctx.userId && inv.fromUserId !== ctx.userId) {
        return null;
      }
      return { ...state, pendingInvite: null };
    }

    if (ctx.type === TTT_ACTION.rematch) {
      if (state.status === 'playing') return null;
      if (!markOf(state, ctx.userId)) return null;
      return freshMatch({ x: state.xUserId, o: state.oUserId });
    }

    if (ctx.type !== TTT_ACTION.place) return null;
    if (state.status !== 'playing') return null;
    if (!state.xUserId || !state.oUserId) return null;
    const mark = markOf(state, ctx.userId);
    if (!mark || mark !== state.currentTurn) return null;
    const cell = (payload as TttPlacePayload | undefined)?.cell;
    if (typeof cell !== 'number') return null;
    const next = applyMoveIfLegal(state.board, cell, mark);
    if (!next) return null;
    const status = terminalFromBoard(next);
    return {
      ...state,
      board: next,
      status,
      currentTurn:
        status === 'playing' ? nextTurnAfter(mark) : state.currentTurn,
    };
  },

  serializeFor: (viewerId, state): TttView => ({
    board: state.board,
    status: state.status,
    xUserId: state.xUserId,
    oUserId: state.oUserId,
    currentTurn: state.currentTurn,
    ready: !!(state.xUserId && state.oUserId),
    youAre: markOf(state, viewerId),
    pendingInvite:
      state.pendingInvite && state.pendingInvite.toUserId === viewerId
        ? state.pendingInvite
        : null,
  }),
};
