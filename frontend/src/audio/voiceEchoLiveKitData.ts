/** Binary JSON payloads on LiveKit `publishData` / `RoomEvent.DataReceived`. */

import type {
  VcActivityPresenceKind,
  VcActivityUiPhase,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';

/** Wall-clock anchored playback sample for YouTube IFrame API sync (guild VC). */
export type EchoYoutubePlaybackSyncV1 = {
  playing: boolean;
  /** YouTube player media time in seconds at {@link wallMs}. */
  mediaTimeSec: number;
  /** `Date.now()` on the publisher when the sample was taken. */
  wallMs: number;
};

export type EchoYoutubeActivityV1 = {
  v: 1;
  t: 'youtube_activity';
  /** Wall-clock; receivers apply the newest payload to approximate shared “watch together” state. */
  updatedAt: number;
  fromUserId: string;
  fromName?: string;
  /** Guild VC activity surface — drives receiver UI phase (picker vs YouTube vs closed). */
  activityPhase: VcActivityUiPhase;
  playlist: YoutubePlaylistEntry[];
  currentIndex: number;
  youtubeBrowseOpen: boolean;
  /**
   * Optional: host publishes periodic samples; followers seek/play via the IFrame API.
   * Omitted on older clients and on non-YouTube phases.
   */
  ytPlayback?: EchoYoutubePlaybackSyncV1 | null;
};

function parseEchoYoutubePlaybackSyncV1(
  raw: unknown,
): EchoYoutubePlaybackSyncV1 | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.playing !== 'boolean') return null;
  if (typeof o.mediaTimeSec !== 'number' || !Number.isFinite(o.mediaTimeSec)) {
    return null;
  }
  if (typeof o.wallMs !== 'number' || !Number.isFinite(o.wallMs)) return null;
  return {
    playing: o.playing,
    mediaTimeSec: o.mediaTimeSec,
    wallMs: o.wallMs,
  };
}

export function encodeEchoYoutubeActivity(
  p: EchoYoutubeActivityV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoYoutubeActivity(
  raw: Uint8Array,
): EchoYoutubeActivityV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoYoutubeActivityV1;
    if (o?.v !== 1 || o?.t !== 'youtube_activity') return null;
    if (typeof o.updatedAt !== 'number') return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (!Array.isArray(o.playlist)) return null;
    if (typeof o.currentIndex !== 'number') return null;
    if (typeof o.youtubeBrowseOpen !== 'boolean') return null;
    const ap = (o as { activityPhase?: unknown }).activityPhase;
    if (
      ap !== 'closed' &&
      ap !== 'pick' &&
      ap !== 'youtube' &&
      ap !== 'wordle' &&
      ap !== 'hangman' &&
      ap !== 'skriggles' &&
      ap !== 'openguessr' &&
      ap !== 'skribbl_io' &&
      ap !== 'gartic_phone' &&
      ap !== 'krunker' &&
      ap !== 'codenames' &&
      ap !== 'richup' &&
      ap !== 'goober_dash' &&
      ap !== 'smash_karts' &&
      ap !== 'cluster_rush' &&
      ap !== 'tic_tac_toe'
    ) {
      return null;
    }
    for (const row of o.playlist) {
      if (!row || typeof row !== 'object') return null;
      if (typeof (row as YoutubePlaylistEntry).id !== 'string') return null;
    }
    const rawYt = (o as { ytPlayback?: unknown }).ytPlayback;
    let ytPlaybackPart: { ytPlayback?: EchoYoutubePlaybackSyncV1 | null } = {};
    if (rawYt === null) ytPlaybackPart = { ytPlayback: null };
    else if (rawYt !== undefined) {
      const parsed = parseEchoYoutubePlaybackSyncV1(rawYt);
      if (parsed) ytPlaybackPart = { ytPlayback: parsed };
    }

    const merged = { ...o, ...ytPlaybackPart } as EchoYoutubeActivityV1 & {
      codenamesRoomUrl?: unknown;
    };
    if ('codenamesRoomUrl' in merged) {
      delete (merged as { codenamesRoomUrl?: unknown }).codenamesRoomUrl;
    }
    return merged;
  } catch {
    return null;
  }
}

/** Compact presence: which VC activity surfaces each peer has open (sent over LiveKit data). */
export type EchoVcActivityPresenceV1 = {
  v: 1;
  t: 'vc_activity_presence';
  updatedAt: number;
  activities: VcActivityPresenceKind[];
};

export function encodeEchoVcActivityPresence(
  p: EchoVcActivityPresenceV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoVcActivityPresence(
  raw: Uint8Array,
): EchoVcActivityPresenceV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoVcActivityPresenceV1;
    if (o?.v !== 1 || o?.t !== 'vc_activity_presence') return null;
    if (typeof o.updatedAt !== 'number') return null;
    if (!Array.isArray(o.activities)) return null;
    const activities: VcActivityPresenceKind[] = [];
    for (const a of o.activities) {
      if (
        a === 'youtube' ||
        a === 'activities' ||
        a === 'wordle' ||
        a === 'hangman' ||
        a === 'skriggles' ||
        a === 'openguessr' ||
        a === 'skribbl_io' ||
        a === 'gartic_phone' ||
        a === 'krunker' ||
        a === 'codenames' ||
        a === 'richup' ||
        a === 'goober_dash' ||
        a === 'smash_karts' ||
        a === 'cluster_rush' ||
        a === 'tic_tac_toe'
      ) {
        activities.push(a);
      }
    }
    return { ...o, activities };
  } catch {
    return null;
  }
}

/** In-flight or active PvP tic-tac-toe match (voice activity; transport-agnostic shape). */
export type EchoTicTacToeActivityV1 = {
  matchId: string;
  revision: number;
  board: readonly ('' | 'X' | 'O')[];
  status: 'playing' | 'draw' | 'x_wins' | 'o_wins';
  xUserId: string;
  oUserId: string;
  currentTurn: 'X' | 'O';
};

export type EchoTicTacToeInviteV1 = {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
};

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

/** Guild VC Skriggles (draw & guess) — settings snapshot fields. */
export type EchoSkrigglesSettingsV1 = {
  rounds: number;
  drawTimeSec: number;
  wordPickSec: number;
  minWordLen: number;
  hints: boolean;
  language: string;
  customWords: string;
};

export type EchoSkrigglesChatEntryV1 = {
  kind: 'guess' | 'close' | 'correct' | 'system';
  userId: string;
  text: string;
  at: number;
  points?: number;
};

export type EchoSkrigglesRoundResultV1 = {
  word: string;
  guessers: { userId: string; points: number }[];
};

/** Guild VC Skriggles — orchestrator/drawer publishes authoritative snapshots. */
export type EchoSkrigglesActivityV1 = {
  v: 1;
  t: 'skriggles_activity';
  updatedAt: number;
  revision: number;
  fromUserId: string;
  roundSeq: number;
  rosterUserIds: string[];
  phase: 'lobby' | 'word_pick' | 'drawing' | 'round_reveal' | 'game_over';
  settings: EchoSkrigglesSettingsV1;
  scores: Record<string, number>;
  drawerUserId: string;
  wordChoices: [string, string, string] | null;
  wordHint: string | null;
  phaseEndsAt: number | null;
  chatLog: EchoSkrigglesChatEntryV1[];
  roundResult: EchoSkrigglesRoundResultV1 | null;
  canvasStrokeSeq: number;
  correctGuessersThisRound: string[];
  hintRevealed: boolean;
};

function parseSkrigglesSettings(raw: unknown): EchoSkrigglesSettingsV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.rounds !== 'number' || !Number.isFinite(o.rounds)) return null;
  if (typeof o.drawTimeSec !== 'number' || !Number.isFinite(o.drawTimeSec))
    return null;
  if (typeof o.wordPickSec !== 'number' || !Number.isFinite(o.wordPickSec))
    return null;
  if (typeof o.minWordLen !== 'number' || !Number.isFinite(o.minWordLen))
    return null;
  if (typeof o.hints !== 'boolean') return null;
  const language =
    typeof o.language === 'string' ? o.language.trim().slice(0, 32) : 'english';
  const customWords =
    typeof o.customWords === 'string' ? o.customWords.slice(0, 4096) : '';
  return {
    rounds: Math.max(2, Math.min(10, Math.floor(o.rounds))),
    drawTimeSec: Math.max(15, Math.min(240, Math.floor(o.drawTimeSec))),
    wordPickSec: Math.max(5, Math.min(30, Math.floor(o.wordPickSec))),
    minWordLen: Math.max(0, Math.min(5, Math.floor(o.minWordLen))),
    hints: o.hints,
    language,
    customWords,
  };
}

function parseSkrigglesChatLog(
  raw: unknown,
): EchoSkrigglesChatEntryV1[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EchoSkrigglesChatEntryV1[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const kind = r.kind;
    if (
      kind !== 'guess' &&
      kind !== 'close' &&
      kind !== 'correct' &&
      kind !== 'system'
    )
      return null;
    if (typeof r.text !== 'string') return null;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null;
    const userId =
      typeof r.userId === 'string' ? r.userId.trim().slice(0, 128) : '';
    const entry: EchoSkrigglesChatEntryV1 = {
      kind,
      userId,
      text: r.text.slice(0, 256),
      at: r.at,
    };
    if (typeof r.points === 'number' && Number.isFinite(r.points)) {
      entry.points = Math.max(0, Math.floor(r.points));
    }
    out.push(entry);
  }
  return out.slice(-50);
}

export function encodeEchoSkrigglesActivity(
  p: EchoSkrigglesActivityV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesActivity(
  raw: Uint8Array,
): EchoSkrigglesActivityV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesActivityV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_activity') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.revision !== 'number' || !Number.isFinite(o.revision))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (
      o.phase !== 'lobby' &&
      o.phase !== 'word_pick' &&
      o.phase !== 'drawing' &&
      o.phase !== 'round_reveal' &&
      o.phase !== 'game_over'
    )
      return null;
    const settings = parseSkrigglesSettings(o.settings);
    if (!settings) return null;
    if (!Array.isArray(o.rosterUserIds) || !o.rosterUserIds.length) return null;
    const roster: string[] = [];
    for (const r of o.rosterUserIds) {
      if (typeof r !== 'string' || !r.trim()) return null;
      roster.push(r.trim());
    }
    if (!o.scores || typeof o.scores !== 'object') return null;
    const scores: Record<string, number> = {};
    for (const uid of roster) {
      const v = (o.scores as Record<string, unknown>)[uid];
      scores[uid] =
        typeof v === 'number' && Number.isFinite(v)
          ? Math.max(0, Math.floor(v))
          : 0;
    }
    const chatLog = parseSkrigglesChatLog(o.chatLog);
    if (!chatLog) return null;
    let wordChoices: [string, string, string] | null = null;
    if (o.wordChoices != null) {
      if (!Array.isArray(o.wordChoices) || o.wordChoices.length !== 3)
        return null;
      const wc: string[] = [];
      for (const w of o.wordChoices) {
        if (typeof w !== 'string' || !w.trim()) return null;
        wc.push(w.trim().slice(0, 32));
      }
      wordChoices = [wc[0]!, wc[1]!, wc[2]!];
    }
    let roundResult: EchoSkrigglesRoundResultV1 | null = null;
    if (o.roundResult != null) {
      if (typeof o.roundResult !== 'object') return null;
      const rr = o.roundResult as EchoSkrigglesRoundResultV1;
      if (typeof rr.word !== 'string') return null;
      if (!Array.isArray(rr.guessers)) return null;
      const guessers: { userId: string; points: number }[] = [];
      for (const g of rr.guessers) {
        if (!g || typeof g !== 'object') return null;
        if (typeof g.userId !== 'string' || !g.userId.trim()) return null;
        guessers.push({
          userId: g.userId.trim(),
          points:
            typeof g.points === 'number' && Number.isFinite(g.points)
              ? Math.max(0, Math.floor(g.points))
              : 0,
        });
      }
      roundResult = { word: rr.word.slice(0, 64), guessers };
    }
    const correctGuessersThisRound: string[] = [];
    if (Array.isArray(o.correctGuessersThisRound)) {
      for (const uid of o.correctGuessersThisRound) {
        if (typeof uid === 'string' && uid.trim())
          correctGuessersThisRound.push(uid.trim());
      }
    }
    return {
      v: 1,
      t: 'skriggles_activity',
      updatedAt: o.updatedAt,
      revision: Math.max(0, Math.floor(o.revision)),
      fromUserId: o.fromUserId.trim(),
      roundSeq: Math.max(0, Math.floor(o.roundSeq)),
      rosterUserIds: roster,
      phase: o.phase,
      settings,
      scores,
      drawerUserId:
        typeof o.drawerUserId === 'string' ? o.drawerUserId.trim() : '',
      wordChoices,
      wordHint:
        o.wordHint === null
          ? null
          : typeof o.wordHint === 'string'
            ? o.wordHint.slice(0, 128)
            : null,
      phaseEndsAt:
        o.phaseEndsAt === null
          ? null
          : typeof o.phaseEndsAt === 'number' && Number.isFinite(o.phaseEndsAt)
            ? o.phaseEndsAt
            : null,
      chatLog,
      roundResult,
      canvasStrokeSeq:
        typeof o.canvasStrokeSeq === 'number' &&
        Number.isFinite(o.canvasStrokeSeq)
          ? Math.max(0, Math.floor(o.canvasStrokeSeq))
          : 0,
      correctGuessersThisRound,
      hintRevealed: o.hintRevealed === true,
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesGuessIntentV1 = {
  v: 1;
  t: 'skriggles_guess_intent';
  updatedAt: number;
  fromUserId: string;
  roundSeq: number;
  guess: string;
};

export function encodeEchoSkrigglesGuessIntent(
  p: EchoSkrigglesGuessIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesGuessIntent(
  raw: Uint8Array,
): EchoSkrigglesGuessIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesGuessIntentV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_guess_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.guess !== 'string' || !o.guess.trim()) return null;
    return {
      v: 1,
      t: 'skriggles_guess_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      roundSeq: Math.floor(o.roundSeq),
      guess: o.guess.trim().slice(0, 64),
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesWordChoiceIntentV1 = {
  v: 1;
  t: 'skriggles_word_choice_intent';
  updatedAt: number;
  fromUserId: string;
  roundSeq: number;
  word: string;
};

export function encodeEchoSkrigglesWordChoiceIntent(
  p: EchoSkrigglesWordChoiceIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesWordChoiceIntent(
  raw: Uint8Array,
): EchoSkrigglesWordChoiceIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesWordChoiceIntentV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_word_choice_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.word !== 'string' || !o.word.trim()) return null;
    return {
      v: 1,
      t: 'skriggles_word_choice_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      roundSeq: Math.floor(o.roundSeq),
      word: o.word.trim().slice(0, 32),
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesSettingsIntentV1 = {
  v: 1;
  t: 'skriggles_settings_intent';
  updatedAt: number;
  fromUserId: string;
  settings: Partial<EchoSkrigglesSettingsV1>;
};

export function encodeEchoSkrigglesSettingsIntent(
  p: EchoSkrigglesSettingsIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesSettingsIntent(
  raw: Uint8Array,
): EchoSkrigglesSettingsIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesSettingsIntentV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_settings_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (!o.settings || typeof o.settings !== 'object') return null;
    return {
      v: 1,
      t: 'skriggles_settings_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      settings: o.settings,
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesStartIntentV1 = {
  v: 1;
  t: 'skriggles_start_intent';
  updatedAt: number;
  fromUserId: string;
};

export function encodeEchoSkrigglesStartIntent(
  p: EchoSkrigglesStartIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesStartIntent(
  raw: Uint8Array,
): EchoSkrigglesStartIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesStartIntentV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_start_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    return {
      v: 1,
      t: 'skriggles_start_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesNextRoundIntentV1 = {
  v: 1;
  t: 'skriggles_next_round_intent';
  updatedAt: number;
  fromUserId: string;
  completedRoundSeq: number;
};

export function encodeEchoSkrigglesNextRoundIntent(
  p: EchoSkrigglesNextRoundIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesNextRoundIntent(
  raw: Uint8Array,
): EchoSkrigglesNextRoundIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesNextRoundIntentV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_next_round_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (
      typeof o.completedRoundSeq !== 'number' ||
      !Number.isFinite(o.completedRoundSeq)
    )
      return null;
    return {
      v: 1,
      t: 'skriggles_next_round_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      completedRoundSeq: Math.floor(o.completedRoundSeq),
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesRoundSecretV1 = {
  v: 1;
  t: 'skriggles_round_secret';
  updatedAt: number;
  fromUserId: string;
  roundSeq: number;
  drawerUserId: string;
  secret: string;
};

export function encodeEchoSkrigglesRoundSecret(
  p: EchoSkrigglesRoundSecretV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesRoundSecret(
  raw: Uint8Array,
): EchoSkrigglesRoundSecretV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesRoundSecretV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_round_secret') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.drawerUserId !== 'string' || !o.drawerUserId.trim())
      return null;
    if (typeof o.secret !== 'string' || !o.secret.trim()) return null;
    return {
      v: 1,
      t: 'skriggles_round_secret',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      roundSeq: Math.floor(o.roundSeq),
      drawerUserId: o.drawerUserId.trim(),
      secret: o.secret.trim().slice(0, 64),
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesStrokeToolV1 = 'pen' | 'eraser';

export type EchoSkrigglesStrokeBatchV1 = {
  v: 1;
  t: 'skriggles_stroke_batch';
  roundSeq: number;
  strokeId: number;
  color: string;
  width: number;
  tool: EchoSkrigglesStrokeToolV1;
  points: number[];
};

export function encodeEchoSkrigglesStrokeBatch(
  p: EchoSkrigglesStrokeBatchV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesStrokeBatch(
  raw: Uint8Array,
): EchoSkrigglesStrokeBatchV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesStrokeBatchV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_stroke_batch') return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.strokeId !== 'number' || !Number.isFinite(o.strokeId))
      return null;
    if (typeof o.color !== 'string' || !o.color.trim()) return null;
    if (typeof o.width !== 'number' || !Number.isFinite(o.width)) return null;
    if (o.tool !== 'pen' && o.tool !== 'eraser') return null;
    if (!Array.isArray(o.points)) return null;
    const points: number[] = [];
    for (const p of o.points) {
      if (typeof p !== 'number' || !Number.isFinite(p)) return null;
      points.push(p);
    }
    if (points.length < 2 || points.length % 2 !== 0) return null;
    if (points.length > 512) return null;
    return {
      v: 1,
      t: 'skriggles_stroke_batch',
      roundSeq: Math.floor(o.roundSeq),
      strokeId: Math.floor(o.strokeId),
      color: o.color.slice(0, 16),
      width: Math.max(1, Math.min(32, o.width)),
      tool: o.tool,
      points,
    };
  } catch {
    return null;
  }
}

export type EchoSkrigglesCanvasCmdV1 =
  | {
      v: 1;
      t: 'skriggles_canvas_cmd';
      roundSeq: number;
      cmd: 'clear' | 'undo';
      seq: number;
    }
  | {
      v: 1;
      t: 'skriggles_canvas_cmd';
      roundSeq: number;
      cmd: 'fill';
      seq: number;
      x: number;
      y: number;
      color: string;
    };

export function encodeEchoSkrigglesCanvasCmd(
  p: EchoSkrigglesCanvasCmdV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesCanvasCmd(
  raw: Uint8Array,
): EchoSkrigglesCanvasCmdV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesCanvasCmdV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_canvas_cmd') return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.seq !== 'number' || !Number.isFinite(o.seq)) return null;
    if (o.cmd === 'clear' || o.cmd === 'undo') {
      return {
        v: 1,
        t: 'skriggles_canvas_cmd',
        roundSeq: Math.floor(o.roundSeq),
        cmd: o.cmd,
        seq: Math.floor(o.seq),
      };
    }
    if (o.cmd === 'fill') {
      const fo = o as Extract<EchoSkrigglesCanvasCmdV1, { cmd: 'fill' }>;
      if (typeof fo.x !== 'number' || !Number.isFinite(fo.x)) return null;
      if (typeof fo.y !== 'number' || !Number.isFinite(fo.y)) return null;
      if (typeof fo.color !== 'string' || !fo.color.trim()) return null;
      return {
        v: 1,
        t: 'skriggles_canvas_cmd',
        roundSeq: Math.floor(o.roundSeq),
        cmd: 'fill',
        seq: Math.floor(o.seq),
        x: fo.x,
        y: fo.y,
        color: fo.color.slice(0, 16),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export type EchoSkrigglesCanvasSnapshotV1 = {
  v: 1;
  t: 'skriggles_canvas_snapshot';
  roundSeq: number;
  seq: number;
  pngBase64: string;
};

export function encodeEchoSkrigglesCanvasSnapshot(
  p: EchoSkrigglesCanvasSnapshotV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoSkrigglesCanvasSnapshot(
  raw: Uint8Array,
): EchoSkrigglesCanvasSnapshotV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoSkrigglesCanvasSnapshotV1;
    if (o?.v !== 1 || o?.t !== 'skriggles_canvas_snapshot') return null;
    if (typeof o.roundSeq !== 'number' || !Number.isFinite(o.roundSeq))
      return null;
    if (typeof o.seq !== 'number' || !Number.isFinite(o.seq)) return null;
    if (typeof o.pngBase64 !== 'string' || !o.pngBase64.length) return null;
    if (o.pngBase64.length > 512_000) return null;
    return {
      v: 1,
      t: 'skriggles_canvas_snapshot',
      roundSeq: Math.floor(o.roundSeq),
      seq: Math.floor(o.seq),
      pngBase64: o.pngBase64,
    };
  } catch {
    return null;
  }
}

/** Guild VC Echoed Names (word grid) — public cell: affiliation exists only when revealed. */
export type EchoCodenamesAffiliationV1 =
  | 'red'
  | 'blue'
  | 'neutral'
  | 'assassin';

export type EchoCodenamesPublicCellV1 =
  | { revealed: false; word: string }
  | {
      revealed: true;
      word: string;
      affiliation: EchoCodenamesAffiliationV1;
    };

export type EchoCodenamesRoleAssignmentV1 = {
  userId: string;
  team: 'red' | 'blue';
  role: 'spymaster' | 'operative';
};

export type EchoCodenamesActivityV1 = {
  v: 1;
  t: 'codenames_activity';
  updatedAt: number;
  revision: number;
  fromUserId: string;
  gameSeq: number;
  rosterUserIds: string[];
  phase: 'lobby' | 'playing' | 'game_over' | 'paused_requires_new_game';
  /** While `playing`: waiting for spymaster clue vs operative guesses. */
  turnStage: 'await_clue' | 'await_guess' | 'na';
  cells: EchoCodenamesPublicCellV1[];
  startingTeam: 'red' | 'blue';
  currentTeam: 'red' | 'blue';
  winner: 'red' | 'blue' | null;
  currentClue: { word: string; number: number } | null;
  guessesRemaining: number;
  roleAssignments: EchoCodenamesRoleAssignmentV1[];
  /** Optional hint for UI (e.g. migration). */
  lastEvent?: string;
};

export type EchoCodenamesSpymasterKeyV1 = {
  v: 1;
  t: 'codenames_spymaster_key';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
  key: EchoCodenamesAffiliationV1[];
};

export type EchoCodenamesKeyToOrchestratorV1 = {
  v: 1;
  t: 'codenames_key_to_orch';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
  key: EchoCodenamesAffiliationV1[];
};

export type EchoCodenamesClueIntentV1 = {
  v: 1;
  t: 'codenames_clue_intent';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
  word: string;
  number: number;
};

export type EchoCodenamesRevealIntentV1 = {
  v: 1;
  t: 'codenames_reveal_intent';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
  cardIndex: number;
};

export type EchoCodenamesEndTurnIntentV1 = {
  v: 1;
  t: 'codenames_end_turn_intent';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
};

export type EchoCodenamesSetupIntentV1 = {
  v: 1;
  t: 'codenames_setup_intent';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
  roleAssignments: EchoCodenamesRoleAssignmentV1[];
};

export type EchoCodenamesDealIntentV1 = {
  v: 1;
  t: 'codenames_deal_intent';
  updatedAt: number;
  fromUserId: string;
  gameSeq: number;
};

export type EchoCodenamesNewGameIntentV1 = {
  v: 1;
  t: 'codenames_new_game_intent';
  updatedAt: number;
  fromUserId: string;
  /** Completed game sequence (must match current snapshot). */
  completedGameSeq: number;
};

function parseCodenamesAffiliation(
  x: unknown,
): EchoCodenamesAffiliationV1 | null {
  if (x === 'red' || x === 'blue' || x === 'neutral' || x === 'assassin')
    return x;
  return null;
}

function parseCodenamesPublicCells(
  raw: unknown,
): EchoCodenamesPublicCellV1[] | null {
  if (!Array.isArray(raw) || raw.length !== 25) return null;
  const out: EchoCodenamesPublicCellV1[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const o = row as Record<string, unknown>;
    const word = typeof o.word === 'string' ? o.word.trim().slice(0, 64) : '';
    if (o.revealed === false) {
      if ('affiliation' in o) return null;
      out.push({ revealed: false, word });
      continue;
    }
    if (o.revealed === true) {
      const aff = parseCodenamesAffiliation(o.affiliation);
      if (!aff) return null;
      out.push({ revealed: true, word, affiliation: aff });
      continue;
    }
    return null;
  }
  return out;
}

function parseCodenamesKey(raw: unknown): EchoCodenamesAffiliationV1[] | null {
  if (!Array.isArray(raw) || raw.length !== 25) return null;
  const out: EchoCodenamesAffiliationV1[] = [];
  for (const x of raw) {
    const a = parseCodenamesAffiliation(x);
    if (!a) return null;
    out.push(a);
  }
  return out;
}

function parseRoleAssignments(
  raw: unknown,
): EchoCodenamesRoleAssignmentV1[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: EchoCodenamesRoleAssignmentV1[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const o = row as Record<string, unknown>;
    const userId = typeof o.userId === 'string' ? o.userId.trim() : '';
    if (!userId) return null;
    const team = o.team;
    const role = o.role;
    if (team !== 'red' && team !== 'blue') return null;
    if (role !== 'spymaster' && role !== 'operative') return null;
    out.push({ userId, team, role });
  }
  return out;
}

export function encodeEchoCodenamesActivity(
  p: EchoCodenamesActivityV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesActivity(
  raw: Uint8Array,
): EchoCodenamesActivityV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesActivityV1;
    if (o?.v !== 1 || o?.t !== 'codenames_activity') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.revision !== 'number' || !Number.isFinite(o.revision))
      return null;
    if (o.revision < 0 || o.revision > 1_000_000_000) return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    if (o.gameSeq < 0 || o.gameSeq > 1_000_000) return null;
    if (!Array.isArray(o.rosterUserIds) || !o.rosterUserIds.length) return null;
    const roster: string[] = [];
    for (const r of o.rosterUserIds) {
      if (typeof r !== 'string' || !r.trim()) return null;
      roster.push(r.trim());
    }
    const ph = o.phase;
    if (
      ph !== 'lobby' &&
      ph !== 'playing' &&
      ph !== 'game_over' &&
      ph !== 'paused_requires_new_game'
    ) {
      return null;
    }
    const ts = o.turnStage;
    if (ts !== 'await_clue' && ts !== 'await_guess' && ts !== 'na') return null;
    const cells = parseCodenamesPublicCells(o.cells);
    if (!cells) return null;
    const st = o.startingTeam;
    const ct = o.currentTeam;
    if (st !== 'red' && st !== 'blue') return null;
    if (ct !== 'red' && ct !== 'blue') return null;
    const w = o.winner;
    if (w !== null && w !== 'red' && w !== 'blue') return null;
    let currentClue: EchoCodenamesActivityV1['currentClue'] = null;
    const cc = o.currentClue;
    if (cc != null) {
      if (typeof cc !== 'object') return null;
      const cw = typeof cc.word === 'string' ? cc.word.trim() : '';
      const cn = cc.number;
      if (!cw || typeof cn !== 'number' || !Number.isFinite(cn)) return null;
      const n = Math.floor(cn);
      if (n < 0 || n > 9) return null;
      currentClue = { word: cw.slice(0, 64), number: n };
    }
    const gr =
      typeof o.guessesRemaining === 'number' &&
      Number.isFinite(o.guessesRemaining)
        ? Math.max(0, Math.floor(o.guessesRemaining))
        : 0;
    const roleAssignments = parseRoleAssignments(o.roleAssignments);
    if (!roleAssignments) return null;
    const lastEvent =
      typeof o.lastEvent === 'string'
        ? o.lastEvent.trim().slice(0, 256)
        : undefined;
    return {
      v: 1,
      t: 'codenames_activity',
      updatedAt: o.updatedAt,
      revision: Math.floor(o.revision),
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
      rosterUserIds: roster,
      phase: ph,
      turnStage: ts,
      cells,
      startingTeam: st,
      currentTeam: ct,
      winner: w,
      currentClue,
      guessesRemaining: gr,
      roleAssignments,
      ...(lastEvent ? { lastEvent } : {}),
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesSpymasterKey(
  p: EchoCodenamesSpymasterKeyV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesSpymasterKey(
  raw: Uint8Array,
): EchoCodenamesSpymasterKeyV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesSpymasterKeyV1;
    if (o?.v !== 1 || o?.t !== 'codenames_spymaster_key') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    const key = parseCodenamesKey(o.key);
    if (!key) return null;
    return {
      v: 1,
      t: 'codenames_spymaster_key',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
      key,
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesKeyToOrchestrator(
  p: EchoCodenamesKeyToOrchestratorV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesKeyToOrchestrator(
  raw: Uint8Array,
): EchoCodenamesKeyToOrchestratorV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesKeyToOrchestratorV1;
    if (o?.v !== 1 || o?.t !== 'codenames_key_to_orch') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    const key = parseCodenamesKey(o.key);
    if (!key) return null;
    return {
      v: 1,
      t: 'codenames_key_to_orch',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
      key,
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesClueIntent(
  p: EchoCodenamesClueIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesClueIntent(
  raw: Uint8Array,
): EchoCodenamesClueIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesClueIntentV1;
    if (o?.v !== 1 || o?.t !== 'codenames_clue_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    const word = typeof o.word === 'string' ? o.word.trim().slice(0, 64) : '';
    if (!word) return null;
    if (typeof o.number !== 'number' || !Number.isFinite(o.number)) return null;
    const n = Math.floor(o.number);
    if (n < 0 || n > 9) return null;
    return {
      v: 1,
      t: 'codenames_clue_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
      word,
      number: n,
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesRevealIntent(
  p: EchoCodenamesRevealIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesRevealIntent(
  raw: Uint8Array,
): EchoCodenamesRevealIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesRevealIntentV1;
    if (o?.v !== 1 || o?.t !== 'codenames_reveal_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    if (typeof o.cardIndex !== 'number' || !Number.isFinite(o.cardIndex))
      return null;
    const idx = Math.floor(o.cardIndex);
    if (idx < 0 || idx > 24) return null;
    return {
      v: 1,
      t: 'codenames_reveal_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
      cardIndex: idx,
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesEndTurnIntent(
  p: EchoCodenamesEndTurnIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesEndTurnIntent(
  raw: Uint8Array,
): EchoCodenamesEndTurnIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesEndTurnIntentV1;
    if (o?.v !== 1 || o?.t !== 'codenames_end_turn_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    return {
      v: 1,
      t: 'codenames_end_turn_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesSetupIntent(
  p: EchoCodenamesSetupIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesSetupIntent(
  raw: Uint8Array,
): EchoCodenamesSetupIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesSetupIntentV1;
    if (o?.v !== 1 || o?.t !== 'codenames_setup_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    const roleAssignments = parseRoleAssignments(o.roleAssignments);
    if (!roleAssignments) return null;
    return {
      v: 1,
      t: 'codenames_setup_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
      roleAssignments,
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesDealIntent(
  p: EchoCodenamesDealIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesDealIntent(
  raw: Uint8Array,
): EchoCodenamesDealIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesDealIntentV1;
    if (o?.v !== 1 || o?.t !== 'codenames_deal_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.gameSeq !== 'number' || !Number.isFinite(o.gameSeq))
      return null;
    return {
      v: 1,
      t: 'codenames_deal_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      gameSeq: Math.floor(o.gameSeq),
    };
  } catch {
    return null;
  }
}

export function encodeEchoCodenamesNewGameIntent(
  p: EchoCodenamesNewGameIntentV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoCodenamesNewGameIntent(
  raw: Uint8Array,
): EchoCodenamesNewGameIntentV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoCodenamesNewGameIntentV1;
    if (o?.v !== 1 || o?.t !== 'codenames_new_game_intent') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt))
      return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (
      typeof o.completedGameSeq !== 'number' ||
      !Number.isFinite(o.completedGameSeq)
    ) {
      return null;
    }
    return {
      v: 1,
      t: 'codenames_new_game_intent',
      updatedAt: o.updatedAt,
      fromUserId: o.fromUserId.trim(),
      completedGameSeq: Math.floor(o.completedGameSeq),
    };
  } catch {
    return null;
  }
}

export type EchoVcDataV1 = {
  v: 1;
  t: 'public_media';
  kind: 'stream_start' | 'stream_end' | 'video_start' | 'video_end';
  userId: string;
  /** Optional display hint (identity is always sent). */
  name?: string;
};

export function encodeEchoVcData(p: EchoVcDataV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

/** Targeted to streamer: viewer stopped watching screen share but stayed in VC. */
export type EchoVcPrivateViewerV1 = {
  v: 1;
  t: 'viewer_stream';
  kind: 'viewer_left_stream';
  viewerId: string;
};

export function encodeEchoVcPrivateViewer(
  p: EchoVcPrivateViewerV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoVcPrivateViewer(
  raw: Uint8Array,
): EchoVcPrivateViewerV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoVcPrivateViewerV1;
    if (o?.v !== 1 || o?.t !== 'viewer_stream') return null;
    if (o.kind !== 'viewer_left_stream') return null;
    if (typeof o.viewerId !== 'string' || !o.viewerId.trim()) return null;
    return o;
  } catch {
    return null;
  }
}

export function decodeEchoVcData(raw: Uint8Array): EchoVcDataV1 | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(raw)) as EchoVcDataV1;
    if (o?.v !== 1 || o?.t !== 'public_media') return null;
    if (
      o.kind !== 'stream_start' &&
      o.kind !== 'stream_end' &&
      o.kind !== 'video_start' &&
      o.kind !== 'video_end'
    ) {
      return null;
    }
    if (typeof o.userId !== 'string' || !o.userId.trim()) return null;
    return o;
  } catch {
    return null;
  }
}
