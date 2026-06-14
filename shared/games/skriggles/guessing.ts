import {
  classifySkrigglesGuess,
  normalizeSkrigglesWord,
  wordHintForSecret,
} from './guess';
import {
  drawerPointsForGuess,
  guesserPointsForCorrect,
  timeRemainingSec,
} from './scoring';
import type {
  SkrigglesGuessOutcome,
  SkrigglesRoundResult,
  SkrigglesSnapshot,
} from './types';
import { appendChatEntry } from './rounds';

export function computeSkrigglesGuessOutcome(opts: {
  activity: SkrigglesSnapshot;
  secret: string;
  guesserUserId: string;
  guessText: string;
  nowMs?: number;
}): SkrigglesGuessOutcome | null {
  const { activity, secret } = opts;
  if (activity.phase !== 'drawing') return null;
  const guesser = opts.guesserUserId.trim();
  if (!guesser || guesser === activity.drawerUserId.trim()) return null;
  if (activity.correctGuessersThisRound.includes(guesser)) return null;

  const now = opts.nowMs ?? Date.now();
  const match = classifySkrigglesGuess(opts.guessText, secret);
  const scores = { ...activity.scores };

  if (match === 'wrong') {
    return wrongOrCloseOutcome(match, guesser, opts.guessText, now, activity);
  }
  if (match === 'close') {
    return wrongOrCloseOutcome(match, guesser, opts.guessText, now, activity);
  }

  return exactGuessOutcome(
    activity,
    secret,
    guesser,
    opts.guessText,
    now,
    scores,
  );
}

function wrongOrCloseOutcome(
  match: 'wrong' | 'close',
  guesser: string,
  guessText: string,
  now: number,
  activity: SkrigglesSnapshot,
): SkrigglesGuessOutcome {
  return {
    match,
    chatEntry: {
      kind: match === 'wrong' ? 'guess' : 'close',
      userId: guesser,
      text: guessText.trim(),
      at: now,
    },
    scores: { ...activity.scores },
    correctGuessersThisRound: [...activity.correctGuessersThisRound],
    phase: activity.phase,
    roundResult: null,
    wordHint: activity.wordHint,
    hintRevealed: activity.hintRevealed,
  };
}

function exactGuessOutcome(
  activity: SkrigglesSnapshot,
  secret: string,
  guesser: string,
  guessText: string,
  now: number,
  scores: Record<string, number>,
): SkrigglesGuessOutcome {
  const remaining = timeRemainingSec(activity.phaseEndsAt, now);
  const position = activity.correctGuessersThisRound.length;
  const guesserPts = guesserPointsForCorrect({
    drawTimeSec: activity.settings.drawTimeSec,
    timeRemainingSec: remaining,
    position,
  });
  scores[guesser] = (scores[guesser] ?? 0) + guesserPts;
  const drawer = activity.drawerUserId.trim();
  scores[drawer] = (scores[drawer] ?? 0) + drawerPointsForGuess(position);

  const correctGuessers = [...activity.correctGuessersThisRound, guesser];
  const nonDrawer = activity.rosterUserIds.filter((id) => id !== drawer);
  const allGuessed =
    nonDrawer.length > 0 &&
    nonDrawer.every((id) => correctGuessers.includes(id));

  return {
    match: 'exact',
    chatEntry: {
      kind: 'correct',
      userId: guesser,
      text: guessText.trim(),
      at: now,
      points: guesserPts,
    },
    scores,
    correctGuessersThisRound: correctGuessers,
    phase: allGuessed ? 'round_reveal' : activity.phase,
    roundResult: null,
    wordHint: wordHintForSecret(secret),
    hintRevealed: true,
  };
}

export function endRoundOnCorrectGuess(
  prev: SkrigglesSnapshot,
  secret: string,
  outcome: SkrigglesGuessOutcome,
  nowMs: number = Date.now(),
): SkrigglesSnapshot {
  const normalized = normalizeSkrigglesWord(secret);
  const guessers = outcome.correctGuessersThisRound.map((uid) => {
    const pts =
      outcome.match === 'exact' && uid === outcome.chatEntry.userId
        ? (outcome.chatEntry.points ?? 0)
        : 0;
    return { userId: uid, points: pts };
  });
  return {
    ...prev,
    phase: 'round_reveal',
    phaseEndsAt: nowMs + 5000,
    scores: outcome.scores,
    chatLog: appendChatEntry(prev.chatLog, outcome.chatEntry),
    correctGuessersThisRound: outcome.correctGuessersThisRound,
    wordHint: normalized,
    hintRevealed: true,
    roundResult: { word: normalized, guessers },
  };
}

export function applyGuessToActivity(
  prev: SkrigglesSnapshot,
  outcome: SkrigglesGuessOutcome,
  secret: string,
  nowMs: number = Date.now(),
): SkrigglesSnapshot {
  if (outcome.match === 'exact') {
    const withChat = mergeGuessChat(prev, outcome);
    if (everyoneGuessed(withChat, outcome)) {
      return endRoundOnCorrectGuess(withChat, secret, outcome, nowMs);
    }
    return withChat;
  }
  return mergeGuessChat(prev, outcome);
}

function mergeGuessChat(
  prev: SkrigglesSnapshot,
  outcome: SkrigglesGuessOutcome,
): SkrigglesSnapshot {
  return {
    ...prev,
    scores: outcome.scores,
    chatLog: appendChatEntry(prev.chatLog, outcome.chatEntry),
    correctGuessersThisRound: outcome.correctGuessersThisRound,
    wordHint: outcome.wordHint ?? prev.wordHint,
    hintRevealed: outcome.hintRevealed,
    phase: outcome.phase,
    roundResult: outcome.roundResult,
  };
}

function everyoneGuessed(
  prev: SkrigglesSnapshot,
  outcome: SkrigglesGuessOutcome,
): boolean {
  const nonDrawer = prev.rosterUserIds.filter(
    (id) => id !== prev.drawerUserId.trim(),
  );
  return (
    nonDrawer.length > 0 &&
    nonDrawer.every((id) => outcome.correctGuessersThisRound.includes(id))
  );
}

export type { SkrigglesRoundResult };
