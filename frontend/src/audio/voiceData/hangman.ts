/** One Hangman letter guess in order (parallel to {@link EchoHangmanActivityV1.guessedLetters}). */
export type EchoHangmanGuessHistoryEntryV1 = {
  userId: string;
  letter: string;
};

function coalesceHangmanGuessHistory(
  guessedLetters: readonly string[],
  raw: unknown,
): EchoHangmanGuessHistoryEntryV1[] {
  if (!Array.isArray(raw) || raw.length !== guessedLetters.length) {
    return guessedLetters.map((letter) => ({ userId: '', letter }));
  }
  const out: EchoHangmanGuessHistoryEntryV1[] = [];
  for (let i = 0; i < guessedLetters.length; i++) {
    const row = raw[i];
    const expected = guessedLetters[i]!;
    if (!row || typeof row !== 'object') {
      return guessedLetters.map((letter) => ({ userId: '', letter }));
    }
    const uidRaw = (row as { userId?: unknown }).userId;
    const letterRaw = (row as { letter?: unknown }).letter;
    const userId =
      typeof uidRaw === 'string' ? uidRaw.trim().slice(0, 128) : '';
    const letter =
      typeof letterRaw === 'string' ? letterRaw.trim().toUpperCase() : '';
    if (!/^[A-Z]$/.test(letter) || letter !== expected) {
      return guessedLetters.map((l) => ({ userId: '', letter: l }));
    }
    out.push({ userId, letter });
  }
  return out;
}

/** Guild VC Hangman — setter publishes authoritative snapshots (LiveKit reliable data). */
export type EchoHangmanActivityV1 = {
  v: 1;
  t: 'hangman_activity';
  updatedAt: number;
  /** Monotonic per setter for same-ms ordering (integer ≥ 0). */
  revision: number;
  fromUserId: string;
  roundSeq: number;
  setterUserId: string;
  rosterUserIds: string[];
  phase: 'setter_picking' | 'guessing' | 'round_over';
  guessedLetters: string[];
  /** Same length as {@link guessedLetters} when present; `userId` empty means unknown / legacy. */
  guessHistory: EchoHangmanGuessHistoryEntryV1[];
  wrongCount: number;
  mask: string | null;
  roundResult: 'won' | 'lost' | null;
  answerReveal: string | null;
};

export function encodeEchoHangmanActivity(
  p: EchoHangmanActivityV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

function isValidHangmanMask(m: string): boolean {
  if (!m.length || m.length > 64) return false;
  for (let i = 0; i < m.length; i++) {
    const c = m.charCodeAt(i);
    if (c === 32) continue;
    if (c >= 65 && c <= 90) continue;
    if (c === 95) continue;
    return false;
  }
  return true;
}

export function decodeEchoHangmanActivity(
  raw: Uint8Array,
): EchoHangmanActivityV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoHangmanActivityV1;
    if (o?.v !== 1 || o?.t !== 'hangman_activity') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.revision !== 'number' || !Number.isFinite(o.revision))
      return null;
    if (o.revision < 0 || o.revision > 1_000_000_000) return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (o.roundSeq < 0 || o.roundSeq > 1_000_000) return null;
    if (typeof o.setterUserId !== 'string' || !o.setterUserId.trim())
      return null;
    if (!Array.isArray(o.rosterUserIds) || !o.rosterUserIds.length) return null;
    const roster: string[] = [];
    for (const r of o.rosterUserIds) {
      if (typeof r !== 'string' || !r.trim()) return null;
      roster.push(r.trim());
    }
    if (
      o.phase !== 'setter_picking' &&
      o.phase !== 'guessing' &&
      o.phase !== 'round_over'
    ) {
      return null;
    }
    if (o.phase === 'setter_picking') {
      if (o.mask !== null) return null;
    } else if (o.phase === 'guessing') {
      if (typeof o.mask !== 'string' || !isValidHangmanMask(o.mask))
        return null;
    } else if (o.phase === 'round_over') {
      if (o.roundResult !== 'won' && o.roundResult !== 'lost') return null;
      if (o.roundResult === 'lost') {
        if (typeof o.answerReveal !== 'string' || !o.answerReveal.trim())
          return null;
      }
    }
    const guessedLetters: string[] = [];
    if (Array.isArray(o.guessedLetters)) {
      for (const g of o.guessedLetters) {
        if (typeof g !== 'string' || !/^[A-Z]$/.test(g)) return null;
        guessedLetters.push(g);
      }
    }
    const guessHistory = coalesceHangmanGuessHistory(
      guessedLetters,
      o.guessHistory,
    );
    const wrongCount =
      typeof o.wrongCount === 'number' && Number.isFinite(o.wrongCount)
        ? Math.max(0, Math.floor(o.wrongCount))
        : 0;
    return {
      v: 1,
      t: 'hangman_activity',
      updatedAt: o.updatedAt,
      revision: Math.floor(o.revision),
      fromUserId: o.fromUserId.trim(),
      roundSeq: Math.floor(o.roundSeq),
      setterUserId: o.setterUserId.trim(),
      rosterUserIds: roster,
      phase: o.phase,
      guessedLetters,
      guessHistory,
      wrongCount,
      mask: typeof o.mask === 'string' ? o.mask : null,
      roundResult:
        o.roundResult === 'won' || o.roundResult === 'lost'
          ? o.roundResult
          : null,
      answerReveal:
        typeof o.answerReveal === 'string' ? o.answerReveal.trim() : null,
    };
  } catch {
    return null;
  }
}

export type EchoHangmanGuessIntentV1 = {
  v: 1;
  t: 'hangman_guess_intent';
  updatedAt: number;
  fromUserId: string;
  roundSeq: number;
  letter: string;
};

export function encodeEchoHangmanGuessIntent(
  p: EchoHangmanGuessIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoHangmanGuessIntent(
  raw: Uint8Array,
): EchoHangmanGuessIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoHangmanGuessIntentV1;
    if (o?.v !== 1 || o?.t !== 'hangman_guess_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.letter !== 'string' || !/^[A-Za-z]$/.test(o.letter))
      return null;
    return {
      v: 1,
      t: 'hangman_guess_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      roundSeq: Math.floor(o.roundSeq),
      letter: o.letter.toUpperCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Setter → orchestrator (LiveKit `destinationIdentities`) so the roster host can
 * apply letter guesses when the setter’s client is flaky or offline.
 */
export type EchoHangmanRoundSecretV1 = {
  v: 1;
  t: 'hangman_round_secret';
  updatedAt: number;
  roundSeq: number;
  setterUserId: string;
  /** Normalized A–Z phrase (same rules as Hangman commit). */
  secret: string;
};

export function encodeEchoHangmanRoundSecret(
  p: EchoHangmanRoundSecretV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoHangmanRoundSecret(
  raw: Uint8Array,
): EchoHangmanRoundSecretV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoHangmanRoundSecretV1;
    if (o?.v !== 1 || o?.t !== 'hangman_round_secret') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (o.roundSeq < 0 || o.roundSeq > 1_000_000) return null;
    if (typeof o.setterUserId !== 'string' || !o.setterUserId.trim())
      return null;
    if (typeof o.secret !== 'string') return null;
    const secret = o.secret.trim().replace(/\s+/g, ' ').toUpperCase();
    if (secret.length < 2 || secret.length > 48) return null;
    if (!/^[A-Z]+(?: [A-Z]+)*$/.test(secret)) return null;
    return {
      v: 1,
      t: 'hangman_round_secret',
      updatedAt: o.updatedAt,
      roundSeq: Math.floor(o.roundSeq),
      setterUserId: o.setterUserId.trim(),
      secret,
    };
  } catch {
    return null;
  }
}

export type EchoHangmanNextRoundV1 = {
  v: 1;
  t: 'hangman_next_round';
  updatedAt: number;
  fromUserId: string;
  /** Must match current shared `roundSeq` when phase is `round_over`. */
  completedRoundSeq: number;
};

export function encodeEchoHangmanNextRound(
  p: EchoHangmanNextRoundV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoHangmanNextRound(
  raw: Uint8Array,
): EchoHangmanNextRoundV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoHangmanNextRoundV1;
    if (o?.v !== 1 || o?.t !== 'hangman_next_round') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (
      typeof o.completedRoundSeq !== 'number' ||
      !Number.isFinite(o.completedRoundSeq)
    ) {
      return null;
    }
    return {
      v: 1,
      t: 'hangman_next_round',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      completedRoundSeq: Math.floor(o.completedRoundSeq),
    };
  } catch {
    return null;
  }
}
