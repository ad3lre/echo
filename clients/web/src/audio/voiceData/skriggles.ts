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
