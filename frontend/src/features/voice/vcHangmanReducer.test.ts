import { describe, expect, it } from 'vitest';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import {
  alignHangmanGuessHistoryToLetters,
  coerceHangmanActivityToLocalRoster,
  computeHangmanGuessOutcome,
  dedupeHangmanGuessedLettersPreservingOrder,
  expectedSetterForRound,
  hangmanMaskForSecretAndGuesses,
  isNewerHangmanTick,
  mergeHangmanPresenceRoster,
  sanitizeHangmanActivityForMerge,
  shouldLocalClientApplyHangmanGuess,
  validateHangmanSecretWord,
} from '@/features/voice/vcHangmanReducer';

function hangmanActivity(
  partial: Partial<EchoHangmanActivityV1>,
): EchoHangmanActivityV1 {
  return {
    v: 1,
    t: 'hangman_activity',
    updatedAt: 1,
    revision: 1,
    fromUserId: 'setter1',
    roundSeq: 0,
    setterUserId: 'setter1',
    rosterUserIds: ['setter1', 'player2'],
    phase: 'setter_picking',
    guessedLetters: [],
    guessHistory: [],
    wrongCount: 0,
    mask: null,
    roundResult: null,
    answerReveal: null,
    ...partial,
  };
}

describe('vcHangmanReducer', () => {
  it('validates allowed phrases', () => {
    expect(validateHangmanSecretWord('  echo voice  ')).toEqual({
      ok: true,
      normalized: 'ECHO VOICE',
    });
    expect(validateHangmanSecretWord('a1').ok).toBe(false);
  });

  it('masks and reveals letters', () => {
    const m0 = hangmanMaskForSecretAndGuesses('CAT', new Set());
    expect(m0).toBe('___');
    const m1 = hangmanMaskForSecretAndGuesses('CAT', new Set(['A', 'C']));
    expect(m1).toBe('CA_');
  });

  it('computes win after final letter', () => {
    const o = computeHangmanGuessOutcome({
      secret: 'DOG',
      guessedLetters: ['D', 'O'],
      letter: 'G',
    });
    expect(o?.status).toBe('won');
    expect(o?.wrongCount).toBe(0);
  });

  it('counts wrong letters toward loss', () => {
    let g: string[] = [];
    for (let i = 0; i < 6; i++) {
      const letter = 'ABCDEF'[i] ?? 'A';
      const o = computeHangmanGuessOutcome({
        secret: 'ZZZ',
        guessedLetters: g,
        letter,
      });
      expect(o).not.toBeNull();
      g = o!.guessedLetters;
      if (i < 5) expect(o!.status).toBe('playing');
      else expect(o!.status).toBe('lost');
    }
  });

  it('round-robin setter from sorted roster', () => {
    const r = ['b', 'a', 'c'];
    const sorted = [...r].sort((x, y) => x.localeCompare(y));
    expect(expectedSetterForRound(sorted, 0)).toBe('a');
    expect(expectedSetterForRound(sorted, 1)).toBe('b');
    expect(expectedSetterForRound(sorted, 2)).toBe('c');
    expect(expectedSetterForRound(sorted, 3)).toBe('a');
  });

  it('merges presence rosters uniquely', () => {
    expect(mergeHangmanPresenceRoster(['b', 'a'], ['c', 'a'])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('compares ticks by updatedAt then revision', () => {
    expect(
      isNewerHangmanTick(
        { updatedAt: 2, revision: 0 },
        { updatedAt: 1, revision: 99 },
      ),
    ).toBe(true);
    expect(
      isNewerHangmanTick(
        { updatedAt: 1, revision: 2 },
        { updatedAt: 1, revision: 1 },
      ),
    ).toBe(true);
    expect(
      isNewerHangmanTick(
        { updatedAt: 1, revision: 1 },
        { updatedAt: 1, revision: 1 },
      ),
    ).toBe(false);
  });

  it('sanitizeHangmanActivityForMerge rejects invalid rosters', () => {
    expect(
      sanitizeHangmanActivityForMerge(hangmanActivity({ setterUserId: '' })),
    ).toBeNull();
    expect(
      sanitizeHangmanActivityForMerge(
        hangmanActivity({ setterUserId: 'x', rosterUserIds: ['a', 'b'] }),
      ),
    ).toBeNull();
  });

  it('sanitizeHangmanActivityForMerge resets setter_picking fields', () => {
    const s = sanitizeHangmanActivityForMerge(
      hangmanActivity({
        phase: 'setter_picking',
        rosterUserIds: ['z', 'setter1', 'a'],
        guessedLetters: ['A', 'B'],
        wrongCount: 4,
        mask: '___',
        roundResult: 'won',
        answerReveal: 'NOPE',
      }),
    );
    expect(s).not.toBeNull();
    expect(s!.rosterUserIds).toEqual(['a', 'setter1', 'z']);
    expect(s!.guessedLetters).toEqual([]);
    expect(s!.guessHistory).toEqual([]);
    expect(s!.wrongCount).toBe(0);
    expect(s!.mask).toBeNull();
    expect(s!.roundResult).toBeNull();
    expect(s!.answerReveal).toBeNull();
  });

  it('sanitizeHangmanActivityForMerge normalizes guessing snapshots', () => {
    const s = sanitizeHangmanActivityForMerge(
      hangmanActivity({
        phase: 'guessing',
        rosterUserIds: ['b', 'setter1', 'a'],
        guessedLetters: ['A', 'a', '1', 'B'],
        wrongCount: 2.7,
        mask: 'A_B',
      }),
    );
    expect(s).not.toBeNull();
    expect(s!.rosterUserIds).toEqual(['a', 'b', 'setter1']);
    expect(s!.guessedLetters).toEqual(['A', 'B']);
    expect(s!.guessHistory).toEqual([
      { userId: '', letter: 'A' },
      { userId: '', letter: 'B' },
    ]);
    expect(s!.wrongCount).toBe(2);
    expect(s!.roundResult).toBeNull();
    expect(s!.answerReveal).toBeNull();
  });

  it('sanitizeHangmanActivityForMerge strips guessHistory userIds not on roster', () => {
    const s = sanitizeHangmanActivityForMerge(
      hangmanActivity({
        phase: 'guessing',
        rosterUserIds: ['setter1', 'player2'],
        guessedLetters: ['X', 'Y'],
        guessHistory: [
          { userId: 'player2', letter: 'X' },
          { userId: 'stranger', letter: 'Y' },
        ],
        wrongCount: 2,
        mask: '___',
      }),
    );
    expect(s!.guessHistory).toEqual([
      { userId: 'player2', letter: 'X' },
      { userId: '', letter: 'Y' },
    ]);
  });

  it('sanitizeHangmanActivityForMerge requires a mask in guessing', () => {
    expect(
      sanitizeHangmanActivityForMerge(
        hangmanActivity({ phase: 'guessing', mask: '' }),
      ),
    ).toBeNull();
    expect(
      sanitizeHangmanActivityForMerge(
        hangmanActivity({ phase: 'guessing', mask: null }),
      ),
    ).toBeNull();
  });

  it('dedupeHangmanGuessedLettersPreservingOrder keeps first occurrence', () => {
    expect(
      dedupeHangmanGuessedLettersPreservingOrder(['A', 'a', 'B', 'A']),
    ).toEqual(['A', 'B']);
  });

  it('alignHangmanGuessHistoryToLetters keeps userId after dedupe', () => {
    const hist = alignHangmanGuessHistoryToLetters(
      ['A', 'B'],
      [
        { userId: 'player2', letter: 'A' },
        { userId: 'player2', letter: 'A' },
        { userId: 'player2', letter: 'B' },
      ],
      ['setter1', 'player2'],
    );
    expect(hist).toEqual([
      { userId: 'player2', letter: 'A' },
      { userId: 'player2', letter: 'B' },
    ]);
  });

  it('coerceHangmanActivityToLocalRoster keeps setter during active rounds', () => {
    const msg = hangmanActivity({
      phase: 'guessing',
      roundSeq: 2,
      setterUserId: 'b',
      rosterUserIds: ['a', 'b'],
      mask: '___',
    });
    const coerced = coerceHangmanActivityToLocalRoster(msg, ['a', 'b', 'c']);
    expect(coerced.setterUserId).toBe('b');
    expect(coerced.rosterUserIds).toEqual(['a', 'b', 'c']);
  });

  it('shouldLocalClientApplyHangmanGuess prefers roster host when present', () => {
    expect(
      shouldLocalClientApplyHangmanGuess({
        selfUserId: 'a',
        setterUserId: 'b',
        rosterSorted: ['a', 'b'],
        presenceUserIds: ['a', 'b'],
        hasRoundSecret: true,
      }),
    ).toBe(true);
    expect(
      shouldLocalClientApplyHangmanGuess({
        selfUserId: 'b',
        setterUserId: 'b',
        rosterSorted: ['a', 'b'],
        presenceUserIds: ['a', 'b'],
        hasRoundSecret: true,
      }),
    ).toBe(false);
  });

  it('shouldLocalClientApplyHangmanGuess falls back to setter when host left', () => {
    expect(
      shouldLocalClientApplyHangmanGuess({
        selfUserId: 'b',
        setterUserId: 'b',
        rosterSorted: ['a', 'b'],
        presenceUserIds: ['b'],
        hasRoundSecret: true,
      }),
    ).toBe(true);
  });

  it('sanitizeHangmanActivityForMerge validates round_over', () => {
    const won = sanitizeHangmanActivityForMerge(
      hangmanActivity({
        phase: 'round_over',
        roundResult: 'won',
        answerReveal: 'SHOULD_STRIP',
        mask: 'CAT',
        guessedLetters: ['C', 'A', 'T'],
      }),
    );
    expect(won?.roundResult).toBe('won');
    expect(won?.answerReveal).toBeNull();
    expect(won?.guessHistory).toEqual([
      { userId: '', letter: 'C' },
      { userId: '', letter: 'A' },
      { userId: '', letter: 'T' },
    ]);

    const lostOk = sanitizeHangmanActivityForMerge(
      hangmanActivity({
        phase: 'round_over',
        roundResult: 'lost',
        answerReveal: '  secret phrase  ',
      }),
    );
    expect(lostOk?.roundResult).toBe('lost');
    expect(lostOk?.answerReveal).toBe('secret phrase');

    expect(
      sanitizeHangmanActivityForMerge(
        hangmanActivity({
          phase: 'round_over',
          roundResult: 'lost',
          answerReveal: '   ',
        }),
      ),
    ).toBeNull();

    expect(
      sanitizeHangmanActivityForMerge(
        hangmanActivity({ phase: 'round_over', roundResult: null }),
      ),
    ).toBeNull();
  });
});
