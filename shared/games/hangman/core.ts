/**
 * Pure Hangman rules — shared by client and authoritative game server.
 * Relocated from `frontend/src/features/voice/vcHangmanReducer.ts` (P2P helpers
 * stay in frontend until M5 cleanup).
 */

export const VC_HANGMAN_MAX_WRONG = 6;
export const VC_HANGMAN_MIN_LEN = 2;
export const VC_HANGMAN_MAX_LEN = 48;
export const VC_HANGMAN_MAX_WORDS = 6;

export type HangmanWordValidation =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

export type HangmanGuessHistoryEntry = {
  userId: string;
  letter: string;
};

export type HangmanPhase = 'setter_picking' | 'guessing' | 'round_over';

export type HangmanGuessOutcome = {
  guessedLetters: string[];
  wrongCount: number;
  mask: string;
  status: 'playing' | 'won' | 'lost';
  answerReveal: string | null;
};

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

export function dedupeHangmanGuessedLettersPreservingOrder(
  raw: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const u = String(x).toUpperCase();
    if (!/^[A-Z]$/.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function alignHangmanGuessHistoryToLetters(
  guessedLetters: readonly string[],
  rawHistory: readonly HangmanGuessHistoryEntry[] | undefined,
  rosterSorted: readonly string[],
): HangmanGuessHistoryEntry[] {
  const roster = new Set(
    rosterSorted.map((x) => String(x).trim()).filter(Boolean),
  );
  const firstByLetter = new Map<string, HangmanGuessHistoryEntry>();
  if (rawHistory) {
    for (const row of rawHistory) {
      const letter = row.letter.trim().toUpperCase();
      if (!/^[A-Z]$/.test(letter) || firstByLetter.has(letter)) continue;
      let userId = row.userId.trim().slice(0, 128);
      if (userId && !roster.has(userId)) userId = '';
      firstByLetter.set(letter, { userId, letter });
    }
  }
  return guessedLetters.map((letter) => {
    const hit = firstByLetter.get(letter);
    return hit ?? { userId: '', letter };
  });
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

export function mergeHangmanRoster(
  a: readonly string[],
  b: readonly string[],
): string[] {
  const s = new Set<string>();
  for (const x of [...a, ...b]) {
    const id = x.trim();
    if (id) s.add(id);
  }
  return [...s].sort((x, y) => x.localeCompare(y));
}
