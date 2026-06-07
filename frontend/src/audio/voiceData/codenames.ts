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
