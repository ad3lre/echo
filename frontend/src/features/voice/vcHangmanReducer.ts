import type {
  EchoHangmanActivityV1,
  EchoHangmanGuessHistoryEntryV1,
} from '@/audio/voiceEchoLiveKitData';

/** Re-export shared pure Hangman rules (authoritative on game-server). */
export {
  VC_HANGMAN_MAX_WRONG,
  VC_HANGMAN_MIN_LEN,
  VC_HANGMAN_MAX_LEN,
  VC_HANGMAN_MAX_WORDS,
  validateHangmanSecretWord,
  hangmanMaskForSecretAndGuesses,
  computeHangmanGuessOutcome,
  dedupeHangmanGuessedLettersPreservingOrder,
  expectedSetterForRound,
  mergeHangmanRoster as mergeHangmanPresenceRoster,
} from '@shared/games/hangman/core';

export type {
  HangmanWordValidation,
  HangmanGuessOutcome,
} from '@shared/games/hangman/core';

import {
  alignHangmanGuessHistoryToLetters as alignShared,
  dedupeHangmanGuessedLettersPreservingOrder,
  expectedSetterForRound,
  mergeHangmanRoster,
} from '@shared/games/hangman/core';

/** Map first history row per letter onto deduped guess order (empty userId = unknown). */
export function alignHangmanGuessHistoryToLetters(
  guessedLetters: readonly string[],
  rawHistory: unknown,
  rosterSorted: readonly string[],
): EchoHangmanGuessHistoryEntryV1[] {
  let parsed: EchoHangmanGuessHistoryEntryV1[] | undefined;
  if (Array.isArray(rawHistory)) {
    parsed = [];
    for (const row of rawHistory) {
      if (!row || typeof row !== 'object') continue;
      const uidRaw = (row as { userId?: unknown }).userId;
      const chRaw = (row as { letter?: unknown }).letter;
      const letter =
        typeof chRaw === 'string' ? chRaw.trim().toUpperCase() : '';
      if (!/^[A-Z]$/.test(letter)) continue;
      const userId =
        typeof uidRaw === 'string' ? uidRaw.trim().slice(0, 128) : '';
      parsed.push({ userId, letter });
    }
  }
  return alignShared(guessedLetters, parsed, rosterSorted);
}

// --- P2P LiveKit merge helpers (unused when HANGMAN_SERVER_MODE) ---

export type HangmanTick = {
  updatedAt: number;
  revision: number;
};

export function isNewerHangmanTick(
  next: HangmanTick,
  prev: HangmanTick | null,
): boolean {
  if (!prev) return true;
  if (next.updatedAt > prev.updatedAt) return true;
  if (next.updatedAt < prev.updatedAt) return false;
  return next.revision > prev.revision;
}

/** Accept setter-authored snapshots; ignore spoofed game fields from non-setters. */
export function sanitizeHangmanActivityForMerge(
  msg: EchoHangmanActivityV1,
): EchoHangmanActivityV1 | null {
  if (!msg.setterUserId?.trim()) return null;
  if (!Array.isArray(msg.rosterUserIds)) return null;
  const roster = msg.rosterUserIds.map((x) => String(x).trim()).filter(Boolean);
  if (!roster.includes(msg.setterUserId)) return null;
  const rosterSorted = [...roster].sort((a, b) => a.localeCompare(b));
  if (msg.phase === 'setter_picking') {
    return {
      ...msg,
      rosterUserIds: rosterSorted,
      guessedLetters: [],
      guessHistory: [],
      wrongCount: 0,
      mask: null,
      roundResult: null,
      answerReveal: null,
    };
  }
  if (msg.phase === 'guessing') {
    if (typeof msg.mask !== 'string' || !msg.mask.length) return null;
    const guessedLettersRaw = Array.isArray(msg.guessedLetters)
      ? msg.guessedLetters.map((x) => String(x).toUpperCase())
      : [];
    const guessedLetters =
      dedupeHangmanGuessedLettersPreservingOrder(guessedLettersRaw);
    const guessHistory = alignHangmanGuessHistoryToLetters(
      guessedLetters,
      msg.guessHistory,
      rosterSorted,
    );
    const wrongCount =
      typeof msg.wrongCount === 'number' && Number.isFinite(msg.wrongCount)
        ? Math.max(0, Math.floor(msg.wrongCount))
        : 0;
    return {
      ...msg,
      rosterUserIds: rosterSorted,
      guessedLetters,
      guessHistory,
      wrongCount,
      mask: msg.mask,
      roundResult: null,
      answerReveal: null,
    };
  }
  if (msg.phase === 'round_over') {
    const rr =
      msg.roundResult === 'won' || msg.roundResult === 'lost'
        ? msg.roundResult
        : null;
    if (!rr) return null;
    const ar =
      typeof msg.answerReveal === 'string' ? msg.answerReveal.trim() : '';
    if (rr === 'lost' && !ar) return null;
    const guessedLettersRaw = Array.isArray(msg.guessedLetters)
      ? msg.guessedLetters.map((x) => String(x).toUpperCase())
      : [];
    const guessedLetters =
      dedupeHangmanGuessedLettersPreservingOrder(guessedLettersRaw);
    const guessHistory = alignHangmanGuessHistoryToLetters(
      guessedLetters,
      msg.guessHistory,
      rosterSorted,
    );
    return {
      ...msg,
      rosterUserIds: rosterSorted,
      roundResult: rr,
      answerReveal: rr === 'lost' ? ar : null,
      guessedLetters,
      guessHistory,
    };
  }
  return null;
}

export function coerceHangmanActivityToLocalRoster(
  msg: EchoHangmanActivityV1,
  localPresenceRosterSorted: string[],
): EchoHangmanActivityV1 {
  const merged = mergeHangmanRoster(
    msg.rosterUserIds,
    localPresenceRosterSorted,
  );
  const msgSetter = msg.setterUserId.trim();
  // During an active round, keep the authoritative setter from the snapshot so
  // roster/presence churn does not hide the keyboard or reject remote updates.
  const setter =
    msg.phase !== 'setter_picking' && msgSetter && merged.includes(msgSetter)
      ? msgSetter
      : (expectedSetterForRound(merged, msg.roundSeq) ?? msgSetter);
  return { ...msg, rosterUserIds: merged, setterUserId: setter };
}

/** @deprecated P2P orchestrator — Codenames still uses this until M3 server mode. */
export function hangmanOrchestratorUserId(
  rosterSorted: readonly string[],
): string | null {
  return rosterSorted[0] ?? null;
}

/** Who on this client should apply incoming guess intents (must hold round secret). */
export function shouldLocalClientApplyHangmanGuess(opts: {
  selfUserId: string;
  setterUserId: string;
  rosterSorted: readonly string[];
  presenceUserIds: readonly string[];
  hasRoundSecret: boolean;
}): boolean {
  const self = opts.selfUserId.trim();
  if (!self || !opts.hasRoundSecret) return false;
  const setter = opts.setterUserId.trim();
  const orch = hangmanOrchestratorUserId(opts.rosterSorted);
  const orchPresent = !!(orch && opts.presenceUserIds.includes(orch));
  if (orchPresent && orch === self) return true;
  if (!orchPresent && setter === self) return true;
  return false;
}
