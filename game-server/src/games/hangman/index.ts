import {
  alignHangmanGuessHistoryToLetters,
  computeHangmanGuessOutcome,
  expectedSetterForRound,
  hangmanMaskForSecretAndGuesses,
  mergeHangmanRoster,
  validateHangmanSecretWord,
  type HangmanGuessHistoryEntry,
  type HangmanPhase,
} from '../../../../shared/games/hangman/core';
import {
  HANGMAN_ACTION,
  type HangmanCommitWordPayload,
  type HangmanGuessLetterPayload,
  type HangmanNextRoundPayload,
  type HangmanView,
} from '../../../../shared/games/hangman';
import type { GameModule } from '../../core/GameModule';

interface HangmanState {
  roundSeq: number;
  setterUserId: string;
  rosterUserIds: string[];
  phase: HangmanPhase;
  secret: string | null;
  guessedLetters: string[];
  guessHistory: HangmanGuessHistoryEntry[];
  wrongCount: number;
  roundResult: 'won' | 'lost' | null;
}

function freshRound(roster: string[], roundSeq: number): HangmanState | null {
  const setter = expectedSetterForRound(roster, roundSeq);
  if (!setter) return null;
  return {
    roundSeq,
    setterUserId: setter,
    rosterUserIds: roster,
    phase: 'setter_picking',
    secret: null,
    guessedLetters: [],
    guessHistory: [],
    wrongCount: 0,
    roundResult: null,
  };
}

function syncRoster(
  state: HangmanState,
  roster: readonly string[],
): HangmanState {
  const merged = mergeHangmanRoster(state.rosterUserIds, roster);
  if (merged.join(',') === state.rosterUserIds.join(',')) return state;
  if (state.phase === 'setter_picking' && !state.secret) {
    const keep = merged.includes(state.setterUserId)
      ? state.setterUserId
      : (expectedSetterForRound(merged, state.roundSeq) ?? '');
    return { ...state, rosterUserIds: merged, setterUserId: keep };
  }
  return { ...state, rosterUserIds: merged };
}

function toView(viewerId: string, state: HangmanState): HangmanView {
  const guessSet = new Set(state.guessedLetters);
  let mask: string | null = null;
  let answerReveal: string | null = null;

  if (state.phase === 'guessing' && state.secret) {
    mask = hangmanMaskForSecretAndGuesses(state.secret, guessSet);
  } else if (state.phase === 'round_over' && state.secret) {
    mask = hangmanMaskForSecretAndGuesses(state.secret, guessSet);
    if (state.roundResult === 'lost') answerReveal = state.secret;
    else if (state.roundResult === 'won') mask = state.secret;
  }

  return {
    roundSeq: state.roundSeq,
    setterUserId: state.setterUserId,
    rosterUserIds: state.rosterUserIds,
    phase: state.phase,
    guessedLetters: state.guessedLetters,
    guessHistory: alignHangmanGuessHistoryToLetters(
      state.guessedLetters,
      state.guessHistory,
      state.rosterUserIds,
    ),
    wrongCount: state.wrongCount,
    mask,
    roundResult: state.roundResult,
    answerReveal,
    youAreSetter: viewerId.trim() === state.setterUserId.trim(),
  };
}

/** Authoritative Hangman — server holds the secret; mask redacts for guessers. */
export const hangmanModule: GameModule<HangmanState, HangmanView> = {
  key: 'hangman',
  tickHz: 0,

  createInitialState: () => ({
    roundSeq: 0,
    setterUserId: '',
    rosterUserIds: [],
    phase: 'setter_picking',
    secret: null,
    guessedLetters: [],
    guessHistory: [],
    wrongCount: 0,
    roundResult: null,
  }),

  onJoin: (state, userId) => {
    const roster = mergeHangmanRoster(state.rosterUserIds, [userId]);
    if (!roster.length) return null;
    if (!state.rosterUserIds.length && !state.setterUserId) {
      return freshRound(roster, 0);
    }
    return syncRoster(state, roster);
  },

  onLeave: (state, userId) => {
    const roster = state.rosterUserIds.filter((id) => id !== userId);
    if (!roster.length) {
      return {
        roundSeq: 0,
        setterUserId: '',
        rosterUserIds: [],
        phase: 'setter_picking',
        secret: null,
        guessedLetters: [],
        guessHistory: [],
        wrongCount: 0,
        roundResult: null,
      };
    }
    if (state.phase === 'round_over') return syncRoster(state, roster);
    return freshRound(roster, state.roundSeq) ?? syncRoster(state, roster);
  },

  reduce: (state, payload, ctx) => {
    const s = syncRoster(state, ctx.roster);

    if (ctx.type === HANGMAN_ACTION.commitWord) {
      if (s.phase !== 'setter_picking' || ctx.userId !== s.setterUserId) {
        return null;
      }
      const word =
        (payload as HangmanCommitWordPayload | undefined)?.word ?? '';
      const validated = validateHangmanSecretWord(word);
      if (!validated.ok) return null;
      return {
        ...s,
        secret: validated.normalized,
        phase: 'guessing',
        guessedLetters: [],
        guessHistory: [],
        wrongCount: 0,
        roundResult: null,
      };
    }

    if (ctx.type === HANGMAN_ACTION.guessLetter) {
      if (s.phase !== 'guessing' || !s.secret) return null;
      if (ctx.userId === s.setterUserId) return null;
      const letter = (payload as HangmanGuessLetterPayload | undefined)?.letter;
      if (typeof letter !== 'string') return null;
      const outcome = computeHangmanGuessOutcome({
        secret: s.secret,
        guessedLetters: s.guessedLetters,
        letter,
      });
      if (!outcome) return null;
      const guessHistory: HangmanGuessHistoryEntry[] = [
        ...s.guessHistory,
        { userId: ctx.userId, letter: letter.toUpperCase() },
      ];
      if (outcome.status === 'playing') {
        return {
          ...s,
          guessedLetters: outcome.guessedLetters,
          guessHistory,
          wrongCount: outcome.wrongCount,
        };
      }
      return {
        ...s,
        phase: 'round_over',
        guessedLetters: outcome.guessedLetters,
        guessHistory,
        wrongCount: outcome.wrongCount,
        roundResult: outcome.status,
      };
    }

    if (ctx.type === HANGMAN_ACTION.nextRound) {
      if (s.phase !== 'round_over') return null;
      const completed = (payload as HangmanNextRoundPayload | undefined)
        ?.completedRoundSeq;
      if (typeof completed !== 'number' || completed !== s.roundSeq)
        return null;
      return freshRound(s.rosterUserIds, s.roundSeq + 1);
    }

    return null;
  },

  serializeFor: (viewerId, state) => toView(viewerId, state),
};
