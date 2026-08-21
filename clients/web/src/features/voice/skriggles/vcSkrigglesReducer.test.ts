import { describe, expect, it } from 'vitest';
import type { EchoSkrigglesActivityV1 } from '@/audio/voiceEchoLiveKitData';
import {
  decodeEchoSkrigglesActivity,
  encodeEchoSkrigglesActivity,
} from '@/audio/voiceEchoLiveKitData';
import {
  classifySkrigglesGuess,
  normalizeSkrigglesWord,
  wordHintForSecret,
} from '@/features/voice/skriggles/vcSkrigglesGuess';
import { guesserPointsForCorrect } from '@/features/voice/skriggles/vcSkrigglesScoring';
import {
  applyWordChoice,
  buildInitialSkrigglesLobby,
  computeSkrigglesGuessOutcome,
  expectedDrawerForRound,
  isNewerSkrigglesTick,
  mergeSkrigglesPresenceRoster,
  startGameFromLobby,
} from '@/features/voice/skriggles/vcSkrigglesReducer';

function activity(
  partial: Partial<EchoSkrigglesActivityV1>,
): EchoSkrigglesActivityV1 {
  return {
    ...buildInitialSkrigglesLobby({
      fromUserId: 'a',
      rosterUserIds: ['a', 'b', 'c'],
    }),
    ...partial,
  };
}

describe('vcSkrigglesGuess', () => {
  it('normalizes and classifies guesses', () => {
    expect(normalizeSkrigglesWord('  hello  world ')).toBe('HELLO WORLD');
    expect(classifySkrigglesGuess('cat', 'CAT')).toBe('exact');
    expect(classifySkrigglesGuess('car', 'CAT')).toBe('close');
    expect(classifySkrigglesGuess('dog', 'CAT')).toBe('wrong');
  });

  it('builds word hints', () => {
    expect(wordHintForSecret('HELLO WORLD')).toBe('_____ _____');
  });
});

describe('vcSkrigglesScoring', () => {
  it('awards more points with more time left', () => {
    const early = guesserPointsForCorrect({
      drawTimeSec: 80,
      timeRemainingSec: 70,
      position: 0,
    });
    const late = guesserPointsForCorrect({
      drawTimeSec: 80,
      timeRemainingSec: 10,
      position: 0,
    });
    expect(early).toBeGreaterThan(late);
  });
});

describe('vcSkrigglesReducer', () => {
  it('merges rosters', () => {
    expect(mergeSkrigglesPresenceRoster(['b'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('compares ticks', () => {
    expect(isNewerSkrigglesTick({ updatedAt: 2, revision: 0 }, null)).toBe(
      true,
    );
    expect(
      isNewerSkrigglesTick(
        { updatedAt: 1, revision: 2 },
        { updatedAt: 1, revision: 1 },
      ),
    ).toBe(true);
  });

  it('rotates drawer by round', () => {
    const r = ['a', 'b', 'c'];
    expect(expectedDrawerForRound(r, 0)).toBe('a');
    expect(expectedDrawerForRound(r, 1)).toBe('b');
    expect(expectedDrawerForRound(r, 3)).toBe('a');
  });

  it('starts game from lobby', () => {
    const lobby = buildInitialSkrigglesLobby({
      fromUserId: 'a',
      rosterUserIds: ['a', 'b'],
    });
    const next = startGameFromLobby(lobby, 'a', 1);
    expect(next?.phase).toBe('word_pick');
    expect(next?.drawerUserId).toBe('a');
    expect(next?.wordChoices?.length).toBe(3);
  });

  it('requires min players to start', () => {
    const solo = buildInitialSkrigglesLobby({
      fromUserId: 'a',
      rosterUserIds: ['a'],
    });
    expect(startGameFromLobby(solo, 'a', 1)).toBeNull();
  });

  it('applies word choice and enters drawing', () => {
    const pick = activity({
      phase: 'word_pick',
      drawerUserId: 'a',
      wordChoices: ['CAT', 'DOG', 'BIRD'],
    });
    const draw = applyWordChoice(pick, 'CAT', 'a', 2);
    expect(draw?.phase).toBe('drawing');
    expect(draw?.wordHint).toBe('___');
    expect(draw?.wordChoices).toBeNull();
  });

  it('computes correct guess outcome', () => {
    const draw = activity({
      phase: 'drawing',
      drawerUserId: 'a',
      phaseEndsAt: Date.now() + 60_000,
      settings: {
        rounds: 3,
        drawTimeSec: 80,
        wordPickSec: 15,
        minWordLen: 0,
        hints: true,
        language: 'english',
        customWords: '',
      },
    });
    const outcome = computeSkrigglesGuessOutcome({
      activity: draw,
      secret: 'CAT',
      guesserUserId: 'b',
      guessText: 'cat',
    });
    expect(outcome?.match).toBe('exact');
    expect(outcome?.scores.b).toBeGreaterThan(0);
    expect(outcome?.scores.a).toBeGreaterThan(0);
  });
});

describe('skriggles wire codec', () => {
  it('round-trips activity snapshot', () => {
    const src = buildInitialSkrigglesLobby({
      fromUserId: 'a',
      rosterUserIds: ['a', 'b'],
    });
    const decoded = decodeEchoSkrigglesActivity(
      encodeEchoSkrigglesActivity(src),
    );
    expect(decoded?.phase).toBe('lobby');
    expect(decoded?.rosterUserIds).toEqual(['a', 'b']);
  });
});
