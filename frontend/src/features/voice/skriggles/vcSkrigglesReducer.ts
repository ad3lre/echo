import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesChatEntryV1,
  EchoSkrigglesRoundResultV1,
  EchoSkrigglesSettingsV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  classifySkrigglesGuess,
  normalizeSkrigglesWord,
  wordHintForSecret,
  wordHintWithFirstLetter,
} from '@/features/voice/skriggles/vcSkrigglesGuess';
import {
  drawerPointsForGuess,
  guesserPointsForCorrect,
  timeRemainingSec,
} from '@/features/voice/skriggles/vcSkrigglesScoring';
import { pickWordChoices } from '@/features/voice/skriggles/vcSkrigglesWordBank';
import {
  hangmanOrchestratorUserId,
  mergeHangmanPresenceRoster,
} from '@/features/voice/vcHangmanReducer';

export {
  hangmanOrchestratorUserId as skrigglesOrchestratorUserId,
  mergeHangmanPresenceRoster as mergeSkrigglesPresenceRoster,
};

export const SKRIGGLES_MAX_CHAT_LOG = 50;
export const SKRIGGLES_MIN_PLAYERS = 2;

export const DEFAULT_SKRIGGLES_SETTINGS: EchoSkrigglesSettingsV1 = {
  rounds: 3,
  drawTimeSec: 80,
  wordPickSec: 15,
  minWordLen: 0,
  hints: true,
  language: 'english',
  customWords: '',
};

export type SkrigglesTick = { updatedAt: number; revision: number };

export function isNewerSkrigglesTick(
  next: SkrigglesTick,
  prev: SkrigglesTick | null,
): boolean {
  if (!prev) return true;
  if (next.updatedAt > prev.updatedAt) return true;
  if (next.updatedAt < prev.updatedAt) return false;
  return next.revision > prev.revision;
}

export function expectedDrawerForRound(
  rosterSorted: readonly string[],
  roundSeq: number,
): string | null {
  if (!rosterSorted.length) return null;
  const idx =
    ((roundSeq % rosterSorted.length) + rosterSorted.length) %
    rosterSorted.length;
  return rosterSorted[idx] ?? null;
}

export function buildInitialSkrigglesLobby(opts: {
  fromUserId: string;
  rosterUserIds: string[];
  revision?: number;
  settings?: Partial<EchoSkrigglesSettingsV1>;
}): EchoSkrigglesActivityV1 {
  const roster = [...opts.rosterUserIds].sort((a, b) => a.localeCompare(b));
  const now = Date.now();
  const scores: Record<string, number> = {};
  for (const uid of roster) scores[uid] = 0;
  return {
    v: 1,
    t: 'skriggles_activity',
    updatedAt: now,
    revision: opts.revision ?? 0,
    fromUserId: opts.fromUserId.trim(),
    roundSeq: 0,
    rosterUserIds: roster,
    phase: 'lobby',
    settings: { ...DEFAULT_SKRIGGLES_SETTINGS, ...opts.settings },
    scores,
    drawerUserId: '',
    wordChoices: null,
    wordHint: null,
    phaseEndsAt: null,
    chatLog: [],
    roundResult: null,
    canvasStrokeSeq: 0,
    correctGuessersThisRound: [],
    hintRevealed: false,
  };
}

export function appendChatEntry(
  log: EchoSkrigglesChatEntryV1[],
  entry: EchoSkrigglesChatEntryV1,
): EchoSkrigglesChatEntryV1[] {
  const next = [...log, entry];
  if (next.length <= SKRIGGLES_MAX_CHAT_LOG) return next;
  return next.slice(next.length - SKRIGGLES_MAX_CHAT_LOG);
}

export function startGameFromLobby(
  activity: EchoSkrigglesActivityV1,
  fromUserId: string,
  revision: number,
): EchoSkrigglesActivityV1 | null {
  if (activity.phase !== 'lobby') return null;
  const roster = activity.rosterUserIds;
  if (roster.length < SKRIGGLES_MIN_PLAYERS) return null;
  return beginWordPickRound(activity, fromUserId, revision, 0);
}

function beginWordPickRound(
  prev: EchoSkrigglesActivityV1,
  fromUserId: string,
  revision: number,
  roundSeq: number,
): EchoSkrigglesActivityV1 {
  const roster = prev.rosterUserIds;
  const drawer = expectedDrawerForRound(roster, roundSeq) ?? '';
  const now = Date.now();
  const choices = pickWordChoices(prev.settings);
  return {
    ...prev,
    updatedAt: now,
    revision,
    fromUserId: fromUserId.trim(),
    roundSeq,
    phase: 'word_pick',
    drawerUserId: drawer,
    wordChoices:
      choices.length === 3 ? [choices[0]!, choices[1]!, choices[2]!] : null,
    wordHint: null,
    phaseEndsAt: now + prev.settings.wordPickSec * 1000,
    chatLog: appendChatEntry(prev.chatLog, {
      kind: 'system',
      userId: '',
      text: `Round ${roundSeq + 1} — ${drawer} is drawing!`,
      at: now,
    }),
    roundResult: null,
    canvasStrokeSeq: 0,
    correctGuessersThisRound: [],
    hintRevealed: false,
  };
}

export function applyWordChoice(
  prev: EchoSkrigglesActivityV1,
  secret: string,
  fromUserId: string,
  revision: number,
): EchoSkrigglesActivityV1 | null {
  if (prev.phase !== 'word_pick') return null;
  if (fromUserId.trim() !== prev.drawerUserId.trim()) return null;
  const normalized = normalizeSkrigglesWord(secret);
  if (!normalized.length) return null;
  const choices = prev.wordChoices ?? [];
  if (choices.length && !choices.includes(normalized)) return null;
  const now = Date.now();
  return {
    ...prev,
    updatedAt: now,
    revision,
    fromUserId: fromUserId.trim(),
    phase: 'drawing',
    wordChoices: null,
    wordHint: wordHintForSecret(normalized),
    phaseEndsAt: now + prev.settings.drawTimeSec * 1000,
    canvasStrokeSeq: 0,
    correctGuessersThisRound: [],
    hintRevealed: false,
  };
}

export type SkrigglesGuessOutcome = {
  match: 'exact' | 'close' | 'wrong';
  chatEntry: EchoSkrigglesChatEntryV1;
  scores: Record<string, number>;
  correctGuessersThisRound: string[];
  phase: EchoSkrigglesActivityV1['phase'];
  roundResult: EchoSkrigglesRoundResultV1 | null;
  wordHint: string | null;
  hintRevealed: boolean;
};

export function computeSkrigglesGuessOutcome(opts: {
  activity: EchoSkrigglesActivityV1;
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
    return {
      match,
      chatEntry: {
        kind: 'guess',
        userId: guesser,
        text: opts.guessText.trim(),
        at: now,
      },
      scores,
      correctGuessersThisRound: [...activity.correctGuessersThisRound],
      phase: activity.phase,
      roundResult: null,
      wordHint: activity.wordHint,
      hintRevealed: activity.hintRevealed,
    };
  }

  if (match === 'close') {
    return {
      match,
      chatEntry: {
        kind: 'close',
        userId: guesser,
        text: opts.guessText.trim(),
        at: now,
      },
      scores,
      correctGuessersThisRound: [...activity.correctGuessersThisRound],
      phase: activity.phase,
      roundResult: null,
      wordHint: activity.wordHint,
      hintRevealed: activity.hintRevealed,
    };
  }

  const remaining = timeRemainingSec(activity.phaseEndsAt, now);
  const position = activity.correctGuessersThisRound.length;
  const guesserPts = guesserPointsForCorrect({
    drawTimeSec: activity.settings.drawTimeSec,
    timeRemainingSec: remaining,
    position,
  });
  const drawerPts = drawerPointsForGuess(position);
  scores[guesser] = (scores[guesser] ?? 0) + guesserPts;
  const drawer = activity.drawerUserId.trim();
  scores[drawer] = (scores[drawer] ?? 0) + drawerPts;

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
      text: opts.guessText.trim(),
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function applySettingsChange(
  prev: EchoSkrigglesActivityV1,
  settings: Partial<EchoSkrigglesSettingsV1>,
  fromUserId: string,
  revision: number,
): EchoSkrigglesActivityV1 | null {
  if (prev.phase !== 'lobby') return null;
  const orch = hangmanOrchestratorUserId(prev.rosterUserIds);
  if (fromUserId.trim() !== orch) return null;
  const now = Date.now();
  return {
    ...prev,
    updatedAt: now,
    revision,
    fromUserId: fromUserId.trim(),
    settings: {
      ...prev.settings,
      ...settings,
      rounds: clamp(settings.rounds ?? prev.settings.rounds, 2, 10),
      drawTimeSec: clamp(
        settings.drawTimeSec ?? prev.settings.drawTimeSec,
        15,
        240,
      ),
      wordPickSec: clamp(
        settings.wordPickSec ?? prev.settings.wordPickSec,
        5,
        30,
      ),
      minWordLen: clamp(settings.minWordLen ?? prev.settings.minWordLen, 0, 5),
    },
  };
}

export function advanceAfterRoundReveal(
  prev: EchoSkrigglesActivityV1,
  fromUserId: string,
  revision: number,
): EchoSkrigglesActivityV1 | null {
  if (prev.phase !== 'round_reveal') return null;
  const orch = hangmanOrchestratorUserId(prev.rosterUserIds);
  if (fromUserId.trim() !== orch) return null;
  const nextRound = prev.roundSeq + 1;
  if (nextRound >= prev.settings.rounds) {
    const now = Date.now();
    return {
      ...prev,
      updatedAt: now,
      revision,
      fromUserId: fromUserId.trim(),
      phase: 'game_over',
      phaseEndsAt: null,
      wordHint: null,
      wordChoices: null,
    };
  }
  return beginWordPickRound(prev, fromUserId, revision, nextRound);
}

export function expirePhaseIfNeeded(
  prev: EchoSkrigglesActivityV1,
  fromUserId: string,
  revision: number,
  secret: string | null,
  nowMs: number = Date.now(),
): EchoSkrigglesActivityV1 | null {
  if (!prev.phaseEndsAt || nowMs < prev.phaseEndsAt) return null;

  if (prev.phase === 'word_pick') {
    const choices = prev.wordChoices;
    const fallback = choices?.[0] ?? pickWordChoices(prev.settings)[0];
    if (!fallback) return null;
    return applyWordChoice(prev, fallback, prev.drawerUserId, revision);
  }

  if (prev.phase === 'drawing') {
    const normalized = secret ? normalizeSkrigglesWord(secret) : '???';
    return {
      ...prev,
      updatedAt: nowMs,
      revision,
      fromUserId: fromUserId.trim(),
      phase: 'round_reveal',
      phaseEndsAt: nowMs + 5000,
      wordHint: normalized,
      hintRevealed: true,
      roundResult: {
        word: normalized,
        guessers: prev.roundResult?.guessers ?? [],
      },
      chatLog: appendChatEntry(prev.chatLog, {
        kind: 'system',
        userId: '',
        text: `Time's up! The word was "${normalized}".`,
        at: nowMs,
      }),
    };
  }

  if (prev.phase === 'round_reveal') {
    return advanceAfterRoundReveal(prev, fromUserId, revision);
  }

  return null;
}

export function applyHintIfEligible(
  prev: EchoSkrigglesActivityV1,
  secret: string,
  nowMs: number = Date.now(),
): EchoSkrigglesActivityV1 | null {
  if (prev.phase !== 'drawing' || !prev.settings.hints || prev.hintRevealed)
    return null;
  if (!prev.phaseEndsAt) return null;
  const elapsed = nowMs - (prev.phaseEndsAt - prev.settings.drawTimeSec * 1000);
  const half = (prev.settings.drawTimeSec * 1000) / 2;
  if (elapsed < half) return null;
  return {
    ...prev,
    hintRevealed: true,
    wordHint: wordHintWithFirstLetter(secret, true),
  };
}

export function skrigglesAuthorAllowed(
  msg: EchoSkrigglesActivityV1,
  roster: string[],
): boolean {
  const from = msg.fromUserId.trim();
  const orch = hangmanOrchestratorUserId(roster);
  const drawer = msg.drawerUserId.trim();
  if (msg.phase === 'lobby' || msg.phase === 'game_over') {
    return from === orch;
  }
  if (msg.phase === 'word_pick' || msg.phase === 'drawing') {
    return from === drawer || from === orch;
  }
  if (msg.phase === 'round_reveal') {
    return from === orch;
  }
  return false;
}

export function coerceSkrigglesActivityToLocalRoster(
  msg: EchoSkrigglesActivityV1,
  localPresenceRosterSorted: string[],
): EchoSkrigglesActivityV1 {
  const merged = mergeHangmanPresenceRoster(
    msg.rosterUserIds,
    localPresenceRosterSorted,
  );
  const msgDrawer = msg.drawerUserId.trim();
  const drawer =
    msg.phase !== 'lobby' && msgDrawer && merged.includes(msgDrawer)
      ? msgDrawer
      : (expectedDrawerForRound(merged, msg.roundSeq) ?? msgDrawer);
  const scores = { ...msg.scores };
  for (const uid of merged) {
    if (scores[uid] == null) scores[uid] = 0;
  }
  return { ...msg, rosterUserIds: merged, drawerUserId: drawer, scores };
}

export function shouldLocalClientApplySkrigglesGuess(opts: {
  selfUserId: string;
  drawerUserId: string;
  rosterSorted: readonly string[];
  presenceUserIds: readonly string[];
  hasRoundSecret: boolean;
}): boolean {
  const self = opts.selfUserId.trim();
  if (!self || !opts.hasRoundSecret) return false;
  const drawer = opts.drawerUserId.trim();
  const orch = hangmanOrchestratorUserId(opts.rosterSorted);
  const orchPresent = !!(orch && opts.presenceUserIds.includes(orch));
  if (orchPresent && orch === self) return true;
  if (!orchPresent && drawer === self) return true;
  return false;
}

export function endRoundOnCorrectGuess(
  prev: EchoSkrigglesActivityV1,
  secret: string,
  fromUserId: string,
  revision: number,
  outcome: SkrigglesGuessOutcome,
  nowMs: number = Date.now(),
): EchoSkrigglesActivityV1 {
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
    updatedAt: nowMs,
    revision,
    fromUserId: fromUserId.trim(),
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
  prev: EchoSkrigglesActivityV1,
  outcome: SkrigglesGuessOutcome,
  fromUserId: string,
  revision: number,
  secret: string,
  nowMs: number = Date.now(),
): EchoSkrigglesActivityV1 {
  if (outcome.match === 'exact') {
    const withChat = {
      ...prev,
      scores: outcome.scores,
      chatLog: appendChatEntry(prev.chatLog, outcome.chatEntry),
      correctGuessersThisRound: outcome.correctGuessersThisRound,
      wordHint: outcome.wordHint ?? prev.wordHint,
      hintRevealed: outcome.hintRevealed,
    };
    const nonDrawer = prev.rosterUserIds.filter(
      (id) => id !== prev.drawerUserId.trim(),
    );
    const everyoneGuessed =
      nonDrawer.length > 0 &&
      nonDrawer.every((id) => outcome.correctGuessersThisRound.includes(id));
    if (everyoneGuessed) {
      return endRoundOnCorrectGuess(
        withChat,
        secret,
        fromUserId,
        revision,
        outcome,
        nowMs,
      );
    }
    return {
      ...withChat,
      updatedAt: nowMs,
      revision,
      fromUserId: fromUserId.trim(),
    };
  }

  return {
    ...prev,
    updatedAt: nowMs,
    revision,
    fromUserId: fromUserId.trim(),
    scores: outcome.scores,
    chatLog: appendChatEntry(prev.chatLog, outcome.chatEntry),
    correctGuessersThisRound: outcome.correctGuessersThisRound,
    wordHint: outcome.wordHint ?? prev.wordHint,
    hintRevealed: outcome.hintRevealed,
    phase: outcome.phase,
    roundResult: outcome.roundResult,
  };
}
