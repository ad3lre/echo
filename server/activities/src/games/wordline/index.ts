import {
  MAX_GUESSES,
  WORD_LENGTH,
} from '../../../cores/games/wordline/constants';
import {
  type GameMode,
  type WordlineSaveState,
  scoreWordlineGuess,
  normalizeWordlineLevel,
  utcDateKeyFromMs,
  wordlineSolutionForMode,
} from '../../../cores/games/wordline/core';
import {
  WORDLINE_ACTION,
  type WordlineSetModePayload,
  type WordlineSubmitGuessPayload,
  type WordlineView,
} from '../../../cores/games/wordline';
import type { GameModule } from '../../core/GameModule';

type UserPuzzle = WordlineSaveState & { solution: string };

interface WordlineState {
  byUser: Record<string, UserPuzzle>;
}

function freshPuzzle(
  _userId: string,
  now: number,
  mode: GameMode = 'daily',
): UserPuzzle {
  const dateKey = utcDateKeyFromMs(now);
  const level = normalizeWordlineLevel(0);
  const solution = wordlineSolutionForMode({ mode, dateKey, level });
  return {
    dateKey,
    mode,
    level,
    rows: [],
    marks: [],
    current: '',
    status: 'playing',
    solution,
  };
}

function puzzleForUser(
  state: WordlineState,
  userId: string,
  now: number,
): UserPuzzle {
  const existing = state.byUser[userId];
  if (existing) return existing;
  return freshPuzzle(userId, now);
}

function toView(puzzle: UserPuzzle): WordlineView {
  const reveal = puzzle.status !== 'playing';
  return {
    dateKey: puzzle.dateKey,
    mode: puzzle.mode,
    level: puzzle.level,
    rows: puzzle.rows,
    marks: puzzle.marks,
    current: puzzle.current,
    status: puzzle.status,
    solution: reveal ? puzzle.solution : null,
  };
}

function isValidGuess(raw: string): boolean {
  return /^[a-z]{5}$/.test(raw.trim().toLowerCase());
}

/** Authoritative Wordline — per-user puzzles; server holds each solution. */
export const wordlineModule: GameModule<WordlineState, WordlineView> = {
  key: 'wordle',
  tickHz: 0,

  createInitialState: () => ({ byUser: {} }),

  onJoin: (state, userId, now) => {
    if (state.byUser[userId]) return null;
    return {
      byUser: { ...state.byUser, [userId]: freshPuzzle(userId, now) },
    };
  },

  onLeave: (state, userId) => {
    if (!state.byUser[userId]) return null;
    const next = { ...state.byUser };
    delete next[userId];
    return { byUser: next };
  },

  reduce: (state, payload, ctx) => {
    const puzzle = puzzleForUser(state, ctx.userId, ctx.now);
    const nextByUser = { ...state.byUser, [ctx.userId]: { ...puzzle } };
    let nextPuzzle = nextByUser[ctx.userId]!;

    if (ctx.type === WORDLINE_ACTION.setMode) {
      const mode = (payload as WordlineSetModePayload | undefined)?.mode;
      if (mode !== 'daily' && mode !== 'levels') return null;
      nextPuzzle = freshPuzzle(ctx.userId, ctx.now, mode);
      nextByUser[ctx.userId] = nextPuzzle;
      return { byUser: nextByUser };
    }

    if (ctx.type !== WORDLINE_ACTION.submitGuess) return null;
    if (nextPuzzle.status !== 'playing') return null;
    const guessRaw = (payload as WordlineSubmitGuessPayload | undefined)?.guess;
    if (typeof guessRaw !== 'string' || !isValidGuess(guessRaw)) return null;

    const guess = guessRaw.trim().toLowerCase();
    const marks = scoreWordlineGuess(guess, nextPuzzle.solution);
    nextPuzzle = {
      ...nextPuzzle,
      rows: [...nextPuzzle.rows, guess],
      marks: [...nextPuzzle.marks, marks],
      current: '',
      status: marks.every((m) => m === 'correct')
        ? 'won'
        : nextPuzzle.rows.length + 1 >= MAX_GUESSES
          ? 'lost'
          : 'playing',
    };
    if (nextPuzzle.status === 'won' && nextPuzzle.mode === 'levels') {
      nextPuzzle.level = normalizeWordlineLevel(nextPuzzle.level + 1);
    }
    nextByUser[ctx.userId] = nextPuzzle;
    return { byUser: nextByUser };
  },

  serializeFor: (viewerId, state) => {
    const puzzle = state.byUser[viewerId];
    if (!puzzle) {
      return {
        dateKey: utcDateKeyFromMs(Date.now()),
        mode: 'daily',
        level: 0,
        rows: [],
        marks: [],
        current: '',
        status: 'playing',
        solution: null,
      };
    }
    return toView(puzzle);
  },
};

export {
  WORD_LENGTH,
  MAX_GUESSES,
} from '../../../cores/games/wordline/constants';
