/** Binary JSON payloads on LiveKit `publishData` / `RoomEvent.DataReceived`. */

import type {
  VcActivityPresenceKind,
  VcActivityUiPhase,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import { normalizeCodenamesRoomUrlForEmbed } from '@/features/voice/vcActivityTypes';

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
   * When {@link activityPhase} is `codenames`, canonical `https://codenames.game/…` room URL
   * for the shared embed (LiveKit unreliable delivery — clients re-broadcast on connect).
   */
  codenamesRoomUrl?: string | null;
};

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
      ap !== 'openguessr' &&
      ap !== 'skribbl_io' &&
      ap !== 'gartic_phone' &&
      ap !== 'krunker' &&
      ap !== 'codenames' &&
      ap !== 'richup' &&
      ap !== 'goober_dash' &&
      ap !== 'smash_karts' &&
      ap !== 'basketball_stars_2026' &&
      ap !== 'cluster_rush'
    ) {
      return null;
    }
    for (const row of o.playlist) {
      if (!row || typeof row !== 'object') return null;
      if (typeof (row as YoutubePlaylistEntry).id !== 'string') return null;
    }
    const rawCn = (o as { codenamesRoomUrl?: unknown }).codenamesRoomUrl;
    if (rawCn !== undefined && rawCn !== null && typeof rawCn !== 'string') {
      return null;
    }
    if (ap === 'codenames') {
      const s =
        typeof rawCn === 'string' && rawCn.trim()
          ? normalizeCodenamesRoomUrlForEmbed(rawCn)
          : null;
      return { ...o, codenamesRoomUrl: s };
    }
    return o;
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
        a === 'openguessr' ||
        a === 'skribbl_io' ||
        a === 'gartic_phone' ||
        a === 'krunker' ||
        a === 'codenames' ||
        a === 'richup' ||
        a === 'goober_dash' ||
        a === 'smash_karts' ||
        a === 'basketball_stars_2026' ||
        a === 'cluster_rush'
      ) {
        activities.push(a);
      }
    }
    return { ...o, activities };
  } catch {
    return null;
  }
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
