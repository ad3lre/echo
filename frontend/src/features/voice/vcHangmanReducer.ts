import type {
  EchoHangmanActivityV1,
  EchoHangmanGuessHistoryEntryV1,
} from '@/audio/voiceEchoLiveKitData';

export const VC_HANGMAN_MAX_WRONG = 6;
export const VC_HANGMAN_MIN_LEN = 2;
export const VC_HANGMAN_MAX_LEN = 48;
export const VC_HANGMAN_MAX_WORDS = 6;

export type HangmanWordValidation =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

/** Uppercase A–Z and single ASCII spaces between words. */
export function validateHangmanSecretWord(raw: string): HangmanWordValidation {
  const trimmed = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  if (trimmed.length < VC_HANGMAN_MIN_LEN) {
    return {
      ok: false,
      error: `At least ${VC_HANGMAN_MIN_LEN} letters total.`,
    };
  }
  if (trimmed.length > VC_HANGMAN_MAX_LEN) {
    return { ok: false, error: `At most ${VC_HANGMAN_MAX_LEN} characters.` };
  }
  const words = trimmed.split(' ');
  if (words.length > VC_HANGMAN_MAX_WORDS) {
    return {
      ok: false,
      error: `At most ${VC_HANGMAN_MAX_WORDS} words.`,
    };
  }
  for (const w of words) {
    if (!w.length) return { ok: false, error: 'Invalid spacing.' };
    if (w.length > 24) {
      return { ok: false, error: 'Each word is at most 24 letters.' };
    }
    if (!/^[A-Z]+$/.test(w)) {
      return {
        ok: false,
        error: 'Letters A–Z only, spaces between words.',
      };
    }
  }
  return { ok: true, normalized: trimmed };
}

export function hangmanMaskForSecretAndGuesses(
  secret: string,
  guessed: ReadonlySet<string>,
): string {
  return secret
    .split('')
    .map((ch) => {
      if (ch === ' ') return ' ';
      const u = ch.toUpperCase();
      return guessed.has(u) ? u : '_';
    })
    .join('');
}

export type HangmanGuessOutcome = {
  guessedLetters: string[];
  wrongCount: number;
  mask: string;
  status: 'playing' | 'won' | 'lost';
  answerReveal: string | null;
};

export function computeHangmanGuessOutcome(opts: {
  secret: string;
  guessedLetters: string[];
  letter: string;
}): HangmanGuessOutcome | null {
  const L = opts.letter.toUpperCase();
  if (!/^[A-Z]$/.test(L)) return null;
  if (opts.guessedLetters.includes(L)) return null;
  const guessedLetters = [...opts.guessedLetters, L];
  const secret = opts.secret;
  const hit = secret.includes(L);
  const prevWrong = opts.guessedLetters.filter(
    (g) => !secret.includes(g),
  ).length;
  const wrongCount = hit ? prevWrong : prevWrong + 1;
  const guessSet = new Set(guessedLetters);
  const lastMask = hangmanMaskForSecretAndGuesses(secret, guessSet);
  const won = !lastMask.includes('_');
  const lost = wrongCount >= VC_HANGMAN_MAX_WRONG;
  let status: 'playing' | 'won' | 'lost' = 'playing';
  let answerReveal: string | null = null;
  if (won) status = 'won';
  else if (lost) {
    status = 'lost';
    answerReveal = secret;
  }
  return { guessedLetters, wrongCount, mask: lastMask, status, answerReveal };
}

/** Drop spoofed guesser ids not on the roster (empty = legacy / unknown). */
export function normalizeHangmanGuessHistoryForRoster(
  guessedLetters: readonly string[],
  rawHistory: unknown,
  rosterSorted: readonly string[],
): EchoHangmanGuessHistoryEntryV1[] {
  const roster = new Set(
    rosterSorted.map((x) => String(x).trim()).filter(Boolean),
  );
  if (!Array.isArray(rawHistory) || rawHistory.length !== guessedLetters.length) {
    return guessedLetters.map((letter) => ({ userId: '', letter }));
  }
  const out: EchoHangmanGuessHistoryEntryV1[] = [];
  for (let i = 0; i < guessedLetters.length; i++) {
    const row = rawHistory[i];
    const L = guessedLetters[i]!;
    if (!row || typeof row !== 'object') {
      return guessedLetters.map((letter) => ({ userId: '', letter }));
    }
    const uidRaw = (row as { userId?: unknown }).userId;
    const chRaw = (row as { letter?: unknown }).letter;
    let userId =
      typeof uidRaw === 'string' ? uidRaw.trim().slice(0, 128) : '';
    const letter =
      typeof chRaw === 'string' ? chRaw.trim().toUpperCase() : '';
    if (!/^[A-Z]$/.test(letter) || letter !== L) {
      return guessedLetters.map((l) => ({ userId: '', letter: l }));
    }
    if (userId && !roster.has(userId)) userId = '';
    out.push({ userId, letter: L });
  }
  return out;
}

export function mergeHangmanPresenceRoster(
  a: readonly string[],
  b: readonly string[],
): string[] {
  const s = new Set<string>();
  for (const x of a) {
    const id = x.trim();
    if (id) s.add(id);
  }
  for (const x of b) {
    const id = x.trim();
    if (id) s.add(id);
  }
  return [...s].sort((x, y) => x.localeCompare(y));
}

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
      ? msg.guessedLetters
          .map((x) => String(x).toUpperCase())
          .filter((x) => /^[A-Z]$/.test(x))
      : [];
    const guessedLetters = [...new Set(guessedLettersRaw)];
    const guessHistory = normalizeHangmanGuessHistoryForRoster(
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
      ? msg.guessedLetters
          .map((x) => String(x).toUpperCase())
          .filter((x) => /^[A-Z]$/.test(x))
      : [];
    const guessedLetters = [...new Set(guessedLettersRaw)];
    const guessHistory = normalizeHangmanGuessHistoryForRoster(
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

export function expectedSetterForRound(
  rosterSorted: readonly string[],
  roundSeq: number,
): string | null {
  if (!rosterSorted.length) return null;
  const idx =
    ((roundSeq % rosterSorted.length) + rosterSorted.length) %
    rosterSorted.length;
  return rosterSorted[idx] ?? null;
}

export function hangmanOrchestratorUserId(
  rosterSorted: readonly string[],
): string | null {
  return rosterSorted[0] ?? null;
}

export function coerceHangmanActivityToLocalRoster(
  msg: EchoHangmanActivityV1,
  localPresenceRosterSorted: string[],
): EchoHangmanActivityV1 {
  const merged = mergeHangmanPresenceRoster(
    msg.rosterUserIds,
    localPresenceRosterSorted,
  );
  const setter =
    expectedSetterForRound(merged, msg.roundSeq) ?? msg.setterUserId;
  return { ...msg, rosterUserIds: merged, setterUserId: setter };
}
