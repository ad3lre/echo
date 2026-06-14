import { mergeHangmanRoster } from '../hangman/core';
import {
  normalizeSkrigglesWord,
  wordHintForSecret,
  wordHintWithFirstLetter,
} from './guess';
import { pickWordChoices } from './wordBank';
import type {
  SkrigglesChatEntry,
  SkrigglesSettings,
  SkrigglesSnapshot,
} from './types';

export const SKRIGGLES_MAX_CHAT_LOG = 50;
export const SKRIGGLES_MIN_PLAYERS = 2;

export const DEFAULT_SKRIGGLES_SETTINGS: SkrigglesSettings = {
  rounds: 3,
  drawTimeSec: 80,
  wordPickSec: 15,
  minWordLen: 0,
  hints: true,
  language: 'english',
  customWords: '',
};

export function appendChatEntry(
  log: SkrigglesChatEntry[],
  entry: SkrigglesChatEntry,
): SkrigglesChatEntry[] {
  const next = [...log, entry];
  if (next.length <= SKRIGGLES_MAX_CHAT_LOG) return next;
  return next.slice(next.length - SKRIGGLES_MAX_CHAT_LOG);
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
  rosterUserIds: string[];
  settings?: Partial<SkrigglesSettings>;
}): SkrigglesSnapshot {
  const roster = [...opts.rosterUserIds].sort((a, b) => a.localeCompare(b));
  const scores: Record<string, number> = {};
  for (const uid of roster) scores[uid] = 0;
  return {
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

export function beginWordPickRound(
  prev: SkrigglesSnapshot,
  roundSeq: number,
  now: number,
): SkrigglesSnapshot {
  const roster = prev.rosterUserIds;
  const drawer = expectedDrawerForRound(roster, roundSeq) ?? '';
  const choices = pickWordChoices(prev.settings);
  return {
    ...prev,
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

export function startGameFromLobby(
  activity: SkrigglesSnapshot,
  roundSeq = 0,
  now = Date.now(),
): SkrigglesSnapshot | null {
  if (activity.phase !== 'lobby') return null;
  if (activity.rosterUserIds.length < SKRIGGLES_MIN_PLAYERS) return null;
  return beginWordPickRound(activity, roundSeq, now);
}

export function applyWordChoice(
  prev: SkrigglesSnapshot,
  secret: string,
  fromUserId: string,
  now: number,
): SkrigglesSnapshot | null {
  if (prev.phase !== 'word_pick') return null;
  if (fromUserId.trim() !== prev.drawerUserId.trim()) return null;
  const normalized = normalizeSkrigglesWord(secret);
  if (!normalized.length) return null;
  const choices = prev.wordChoices ?? [];
  if (choices.length && !choices.includes(normalized)) return null;
  return {
    ...prev,
    phase: 'drawing',
    wordChoices: null,
    wordHint: wordHintForSecret(normalized),
    phaseEndsAt: now + prev.settings.drawTimeSec * 1000,
    canvasStrokeSeq: 0,
    correctGuessersThisRound: [],
    hintRevealed: false,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function applySettingsChange(
  prev: SkrigglesSnapshot,
  settings: Partial<SkrigglesSettings>,
  fromUserId: string,
  orchestratorId: string | null,
): SkrigglesSnapshot | null {
  if (prev.phase !== 'lobby') return null;
  if (fromUserId.trim() !== orchestratorId) return null;
  return {
    ...prev,
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
  prev: SkrigglesSnapshot,
  fromUserId: string,
  orchestratorId: string | null,
): SkrigglesSnapshot | null {
  if (prev.phase !== 'round_reveal') return null;
  if (fromUserId.trim() !== orchestratorId) return null;
  const nextRound = prev.roundSeq + 1;
  if (nextRound >= prev.settings.rounds) {
    return {
      ...prev,
      phase: 'game_over',
      phaseEndsAt: null,
      wordHint: null,
      wordChoices: null,
    };
  }
  return beginWordPickRound(prev, nextRound, Date.now());
}

export function expirePhaseIfNeeded(
  prev: SkrigglesSnapshot,
  fromUserId: string,
  orchestratorId: string | null,
  secret: string | null,
  nowMs: number = Date.now(),
): SkrigglesSnapshot | null {
  if (!prev.phaseEndsAt || nowMs < prev.phaseEndsAt) return null;

  if (prev.phase === 'word_pick') {
    const choices = prev.wordChoices;
    const fallback = choices?.[0] ?? pickWordChoices(prev.settings)[0];
    if (!fallback) return null;
    return applyWordChoice(prev, fallback, prev.drawerUserId, nowMs);
  }

  if (prev.phase === 'drawing') {
    const normalized = secret ? normalizeSkrigglesWord(secret) : '???';
    return {
      ...prev,
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
    return advanceAfterRoundReveal(prev, fromUserId, orchestratorId);
  }

  return null;
}

export function applyHintIfEligible(
  prev: SkrigglesSnapshot,
  secret: string,
  nowMs: number = Date.now(),
): SkrigglesSnapshot | null {
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

export function coerceSkrigglesSnapshotToRoster(
  msg: SkrigglesSnapshot,
  localPresenceRosterSorted: string[],
): SkrigglesSnapshot {
  const merged = mergeHangmanRoster(
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

export function skrigglesOrchestratorUserId(
  rosterSorted: readonly string[],
): string | null {
  const roster = [
    ...new Set(rosterSorted.map((x) => x.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return roster[0] ?? null;
}
