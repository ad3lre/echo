import {
  EMPTY_BOARD,
  type TttCell,
  type TttTerminal,
} from '../../../cores/games/ticTacToe/core';
import {
  TTT_ACTION,
  type TttChallengePayload,
  type TttPendingInvite,
  type TttPlacePayload,
  type TttView,
} from '../../../cores/games/ticTacToe';
import type { GameModule } from '../../core/GameModule';
import { HolyCTicTacToeEngine } from './holycEngine';

interface HolyCTttState {
  board: TttCell[];
  xUserId: string;
  oUserId: string;
  currentTurn: 'X' | 'O';
  status: TttTerminal;
  pendingInvite: TttPendingInvite | null;
  engine: HolyCTicTacToeEngine;
}

function markOf(state: HolyCTttState, userId: string): 'X' | 'O' | null {
  if (userId && userId === state.xUserId) return 'X';
  if (userId && userId === state.oUserId) return 'O';
  return null;
}

function freshMatch(
  engine: HolyCTicTacToeEngine,
  seats?: { x?: string; o?: string },
): HolyCTttState {
  return {
    board: [...EMPTY_BOARD],
    xUserId: seats?.x ?? '',
    oUserId: seats?.o ?? '',
    currentTurn: 'X',
    status: 'playing',
    pendingInvite: null,
    engine,
  };
}

function matchIdle(state: HolyCTttState): boolean {
  return !state.xUserId && !state.oUserId && state.status === 'playing';
}

function rosterHas(roster: readonly string[], userId: string): boolean {
  const id = userId.trim();
  return !!id && roster.some((r) => r.trim() === id);
}

/**
 * Experimental module that keeps Echo's identity and invite policy in Node,
 * delegating only the pure board transition to the supervised HolyC process.
 */
export function createHolyCTicTacToeModule(options: {
  command: string;
  args?: readonly string[];
  timeoutMs?: number;
}): GameModule<HolyCTttState, TttView> {
  return {
    key: 'tic_tac_toe',
    tickHz: 0,

    createInitialState: () =>
      freshMatch(
        new HolyCTicTacToeEngine({
          command: options.command,
          args: options.args,
          timeoutMs: options.timeoutMs,
        }),
      ),

    onJoin: () => null,

    onLeave: (state, userId) => {
      const mark = markOf(state, userId);
      if (mark) {
        return freshMatch(
          state.engine,
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

    dispose: (state) => state.engine.dispose(),

    reduce: async (state, payload, ctx) => {
      if (ctx.type === TTT_ACTION.challenge) {
        if (!matchIdle(state) || state.pendingInvite) return null;
        const to = (
          payload as TttChallengePayload | undefined
        )?.toUserId?.trim();
        if (!to || to === ctx.userId || !rosterHas(ctx.roster, to)) return null;
        return {
          ...state,
          pendingInvite: {
            inviteId: `ttt-${ctx.userId}-${to}-${ctx.now}`,
            fromUserId: ctx.userId,
            toUserId: to,
          },
        };
      }

      if (ctx.type === TTT_ACTION.acceptInvite) {
        const inv = state.pendingInvite;
        if (!inv || inv.toUserId !== ctx.userId) return null;
        await state.engine.reset(ctx.revision + 1);
        return freshMatch(state.engine, {
          x: inv.fromUserId,
          o: inv.toUserId,
        });
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
        await state.engine.reset(ctx.revision + 1);
        return freshMatch(state.engine, {
          x: state.xUserId,
          o: state.oUserId,
        });
      }

      if (ctx.type !== TTT_ACTION.place || state.status !== 'playing') {
        return null;
      }
      if (!state.xUserId || !state.oUserId) return null;
      const mark = markOf(state, ctx.userId);
      if (!mark || mark !== state.currentTurn) return null;
      const cell = (payload as TttPlacePayload | undefined)?.cell;
      if (typeof cell !== 'number' || !Number.isInteger(cell)) return null;

      const snapshot = await state.engine.apply(ctx.revision + 1, cell, mark);
      if (!snapshot) return null;
      return {
        ...state,
        board: snapshot.board,
        status: snapshot.status,
        currentTurn: snapshot.currentTurn,
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
}
