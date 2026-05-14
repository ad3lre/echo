import { describe, expect, it } from 'vitest';
import {
  computeHangmanGuessOutcome,
  expectedSetterForRound,
  hangmanMaskForSecretAndGuesses,
  isNewerHangmanTick,
  mergeHangmanPresenceRoster,
  validateHangmanSecretWord,
} from '@/features/voice/vcHangmanReducer';

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
});
