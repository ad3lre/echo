import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesPublicCellV1,
  EchoCodenamesRoleAssignmentV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  hangmanOrchestratorUserId,
  mergeHangmanPresenceRoster,
} from '@/features/voice/vcHangmanReducer';

export { mergeHangmanPresenceRoster as mergeCodenamesPresenceRoster };
export { hangmanOrchestratorUserId as codenamesOrchestratorUserId };

export type CodenamesTick = { updatedAt: number; revision: number };

export function isNewerCodenamesTick(
  next: CodenamesTick,
  prev: CodenamesTick | null,
): boolean {
  if (!prev) return true;
  if (next.updatedAt > prev.updatedAt) return true;
  if (next.updatedAt < prev.updatedAt) return false;
  return next.revision > prev.revision;
}

const PLACEHOLDER = '—';

export function emptyLobbyCells(): EchoCodenamesPublicCellV1[] {
  return Array.from({ length: 25 }, () => ({
    revealed: false,
    word: PLACEHOLDER,
  }));
}

/** NFC, strip non-alphanumerics, uppercase — single-token clues. */
export function normalizeClueSurface(raw: string): string {
  const s = raw.normalize('NFC').trim().toUpperCase();
  return s.replace(/[^A-Z0-9]+/g, '');
}

function normalizeBoardWordForCompare(raw: string): string {
  return raw.normalize('NFC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Forms used to reject clues “too close” to an unrevealed board word. */
export function compareFormsForToken(token: string): string[] {
  const t = normalizeBoardWordForCompare(token);
  if (!t.length) return [];
  const out = new Set<string>([t]);
  if (t.length > 1 && t.endsWith('S')) {
    out.add(t.slice(0, -1));
    if (t.endsWith('ES') && t.length > 2) out.add(t.slice(0, -2));
  }
  return [...out];
}

export function clueConflictsWithUnrevealedBoard(
  clueRaw: string,
  cells: readonly EchoCodenamesPublicCellV1[],
): boolean {
  const clue = normalizeClueSurface(clueRaw);
  if (!clue.length) return true;
  const clueForms = compareFormsForToken(clue);
  for (const cell of cells) {
    if (cell.revealed) continue;
    const wForms = compareFormsForToken(cell.word);
    for (const cf of clueForms) {
      if (wForms.includes(cf)) return true;
    }
  }
  return false;
}

export function validateRoleSetup(
  rosterSorted: readonly string[],
  roles: readonly EchoCodenamesRoleAssignmentV1[],
): EchoCodenamesRoleAssignmentV1[] | null {
  const roster = new Set(rosterSorted.map((x) => x.trim()).filter(Boolean));
  if (roster.size < 4) return null;
  const seen = new Set<string>();
  let redSm = 0;
  let blueSm = 0;
  const out: EchoCodenamesRoleAssignmentV1[] = [];
  for (const r of roles) {
    const uid = r.userId.trim();
    if (!uid || !roster.has(uid)) return null;
    if (seen.has(uid)) return null;
    seen.add(uid);
    if (r.team !== 'red' && r.team !== 'blue') return null;
    if (r.role !== 'spymaster' && r.role !== 'operative') return null;
    if (r.role === 'spymaster') {
      if (r.team === 'red') redSm++;
      else blueSm++;
    }
    out.push({ userId: uid, team: r.team, role: r.role });
  }
  if (seen.size !== roster.size) return null;
  if (redSm !== 1 || blueSm !== 1) return null;
  const redOps = out.filter((x) => x.team === 'red' && x.role === 'operative')
    .length;
  const blueOps = out.filter((x) => x.team === 'blue' && x.role === 'operative')
    .length;
  if (redOps < 1 || blueOps < 1) return null;
  return out.sort((a, b) => a.userId.localeCompare(b.userId));
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i]!;
    const b = arr[j]!;
    arr[i] = b;
    arr[j] = a;
  }
}

/** Deterministic PRNG from seed (32-bit). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWordsAndKey(opts: {
  wordBank: readonly string[];
  gameSeq: number;
  channelSalt: string;
  rosterUserIdsSorted: readonly string[];
}): { words: string[]; key: EchoCodenamesAffiliationV1[]; startingTeam: 'red' | 'blue' } {
  const seedStr = `${opts.channelSalt}|${opts.gameSeq}|${opts.rosterUserIdsSorted.join(',')}`;
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i)!;
    h |= 0;
  }
  const rng = mulberry32(h);

  const singles = opts.wordBank
    .map((w) => w.normalize('NFC').trim().toUpperCase())
    .filter((w) => /^[A-Z]+$/.test(w) && w.length >= 3 && w.length <= 24);
  const uniq = [...new Set(singles)];
  shuffleInPlace(uniq, rng);
  const words = uniq.slice(0, 25);
  while (words.length < 25) {
    words.push(`EXTRA${words.length}`);
  }

  const startingTeam: 'red' | 'blue' = rng() < 0.5 ? 'red' : 'blue';
  const other: 'red' | 'blue' = startingTeam === 'red' ? 'blue' : 'red';
  const idx = [...Array(25).keys()];
  shuffleInPlace(idx, rng);
  const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
  for (let i = 0; i < 9; i++) key[idx[i]!] = startingTeam;
  for (let i = 0; i < 8; i++) key[idx[9 + i]!] = other;
  for (let i = 0; i < 7; i++) key[idx[17 + i]!] = 'neutral';
  key[idx[24]!] = 'assassin';

  return { words, key, startingTeam };
}

export function cellsFromWords(words: string[]): EchoCodenamesPublicCellV1[] {
  return words.map((word) => ({ revealed: false, word }));
}

export function codenamesAuthorAllowed(
  msg: EchoCodenamesActivityV1,
  orchestratorId: string | null,
): boolean {
  const orch = orchestratorId?.trim();
  if (!orch) return false;
  return msg.fromUserId.trim() === orch;
}

export function coerceCodenamesActivityToLocalRoster(
  msg: EchoCodenamesActivityV1,
  localPresenceRosterSorted: readonly string[],
): EchoCodenamesActivityV1 {
  const merged = mergeHangmanPresenceRoster(
    msg.rosterUserIds,
    localPresenceRosterSorted,
  );
  return { ...msg, rosterUserIds: merged };
}

export function sanitizeCodenamesActivityForMerge(
  msg: EchoCodenamesActivityV1,
): EchoCodenamesActivityV1 | null {
  if (!msg.rosterUserIds.length) return null;
  if (msg.cells.length !== 25) return null;
  for (const c of msg.cells) {
    if (!c.revealed && 'affiliation' in c) return null;
    if (c.revealed && !('affiliation' in c)) return null;
  }
  if (msg.phase === 'playing') {
    if (msg.turnStage !== 'await_clue' && msg.turnStage !== 'await_guess')
      return null;
  } else if (msg.turnStage !== 'na') return null;
  return msg;
}

export function buildBootstrapLobby(opts: {
  fromUserId: string;
  rosterUserIds: string[];
  revision: number;
}): EchoCodenamesActivityV1 {
  const now = Date.now();
  return {
    v: 1,
    t: 'codenames_activity',
    updatedAt: now,
    revision: opts.revision,
    fromUserId: opts.fromUserId.trim(),
    gameSeq: 0,
    rosterUserIds: [...opts.rosterUserIds].sort((a, b) => a.localeCompare(b)),
    phase: 'lobby',
    turnStage: 'na',
    cells: emptyLobbyCells(),
    startingTeam: 'red',
    currentTeam: 'red',
    winner: null,
    currentClue: null,
    guessesRemaining: 0,
    roleAssignments: [],
  };
}

export function applySetupToLobby(
  prev: EchoCodenamesActivityV1,
  roles: EchoCodenamesRoleAssignmentV1[],
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 | null {
  if (prev.phase !== 'lobby') return null;
  const roster = prev.rosterUserIds;
  const v = validateRoleSetup(roster, roles);
  if (!v) return null;
  return {
    ...prev,
    updatedAt: Date.now(),
    revision,
    fromUserId: fromUserId.trim(),
    roleAssignments: v,
  };
}

export function applyDeal(
  prev: EchoCodenamesActivityV1,
  words: string[],
  key: EchoCodenamesAffiliationV1[],
  startingTeam: 'red' | 'blue',
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 | null {
  if (prev.phase !== 'lobby') return null;
  if (words.length !== 25 || key.length !== 25) return null;
  if (!prev.roleAssignments.length) return null;
  return {
    ...prev,
    updatedAt: Date.now(),
    revision,
    fromUserId: fromUserId.trim(),
    phase: 'playing',
    turnStage: 'await_clue',
    cells: cellsFromWords(words),
    startingTeam,
    currentTeam: startingTeam,
    winner: null,
    currentClue: null,
    guessesRemaining: 0,
  };
}

export function applyClue(
  prev: EchoCodenamesActivityV1,
  spymasterUserId: string,
  word: string,
  number: number,
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 | null {
  if (prev.phase !== 'playing' || prev.turnStage !== 'await_clue') return null;
  const clueWord = word.trim();
  if (!clueWord || number < 0 || number > 9) return null;
  if (clueConflictsWithUnrevealedBoard(clueWord, prev.cells)) return null;
  const role = prev.roleAssignments.find(
    (r) => r.userId === spymasterUserId.trim(),
  );
  if (!role || role.role !== 'spymaster' || role.team !== prev.currentTeam)
    return null;
  return {
    ...prev,
    updatedAt: Date.now(),
    revision,
    fromUserId: fromUserId.trim(),
    turnStage: 'await_guess',
    currentClue: { word: clueWord.slice(0, 64), number },
    guessesRemaining: number + 1,
  };
}

function countRemainingTeamCells(
  cells: readonly EchoCodenamesPublicCellV1[],
  key: readonly EchoCodenamesAffiliationV1[],
  team: 'red' | 'blue',
): number {
  let n = 0;
  for (let i = 0; i < 25; i++) {
    const c = cells[i]!;
    const k = key[i]!;
    if (!c.revealed && k === team) n++;
  }
  return n;
}

export function applyReveal(
  prev: EchoCodenamesActivityV1,
  operativeUserId: string,
  cardIndex: number,
  key: readonly EchoCodenamesAffiliationV1[],
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 | null {
  if (prev.phase !== 'playing' || prev.turnStage !== 'await_guess') return null;
  if (cardIndex < 0 || cardIndex > 24) return null;
  const op = prev.roleAssignments.find(
    (r) => r.userId === operativeUserId.trim(),
  );
  if (!op || op.role !== 'operative' || op.team !== prev.currentTeam)
    return null;
  const cell = prev.cells[cardIndex]!;
  if (cell.revealed) return null;
  const aff = key[cardIndex]!;
  if (!aff) return null;

  const nextCells = [...prev.cells] as EchoCodenamesPublicCellV1[];
  nextCells[cardIndex] = {
    revealed: true,
    word: cell.word,
    affiliation: aff,
  };

  let phase: EchoCodenamesActivityV1['phase'] = prev.phase;
  let turnStage: EchoCodenamesActivityV1['turnStage'] = prev.turnStage;
  let currentTeam = prev.currentTeam;
  let winner: EchoCodenamesActivityV1['winner'] = prev.winner;
  let guessesRemaining = Math.max(0, prev.guessesRemaining - 1);

  if (aff === 'assassin') {
    phase = 'game_over';
    turnStage = 'na';
    winner = prev.currentTeam === 'red' ? 'blue' : 'red';
    guessesRemaining = 0;
  } else if (aff === 'neutral') {
    currentTeam = prev.currentTeam === 'red' ? 'blue' : 'red';
    turnStage = 'await_clue';
    guessesRemaining = 0;
  } else if (aff !== prev.currentTeam) {
    currentTeam = prev.currentTeam === 'red' ? 'blue' : 'red';
    turnStage = 'await_clue';
    guessesRemaining = 0;
  } else {
    const remainingOwn = countRemainingTeamCells(
      nextCells,
      key,
      prev.currentTeam,
    );
    if (remainingOwn === 0) {
      phase = 'game_over';
      turnStage = 'na';
      winner = prev.currentTeam;
      guessesRemaining = 0;
    } else if (guessesRemaining === 0) {
      currentTeam = prev.currentTeam === 'red' ? 'blue' : 'red';
      turnStage = 'await_clue';
    }
  }

  return {
    ...prev,
    updatedAt: Date.now(),
    revision,
    fromUserId: fromUserId.trim(),
    cells: nextCells,
    phase,
    turnStage,
    currentTeam,
    winner,
    guessesRemaining,
    currentClue: turnStage === 'await_clue' ? null : prev.currentClue,
  };
}

export function applyEndTurn(
  prev: EchoCodenamesActivityV1,
  operativeUserId: string,
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 | null {
  if (prev.phase !== 'playing' || prev.turnStage !== 'await_guess') return null;
  const op = prev.roleAssignments.find(
    (r) => r.userId === operativeUserId.trim(),
  );
  if (!op || op.role !== 'operative' || op.team !== prev.currentTeam)
    return null;
  return {
    ...prev,
    updatedAt: Date.now(),
    revision,
    fromUserId: fromUserId.trim(),
    currentTeam: prev.currentTeam === 'red' ? 'blue' : 'red',
    turnStage: 'await_clue',
    guessesRemaining: 0,
    currentClue: null,
  };
}

export function applyNewGameLobby(
  prev: EchoCodenamesActivityV1,
  completedGameSeq: number,
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 | null {
  if (prev.gameSeq !== completedGameSeq) return null;
  if (prev.phase !== 'game_over' && prev.phase !== 'paused_requires_new_game')
    return null;
  return {
    ...buildBootstrapLobby({
      fromUserId,
      rosterUserIds: prev.rosterUserIds,
      revision,
    }),
    gameSeq: prev.gameSeq + 1,
  };
}

export function applyPausedRequiresNewGame(
  prev: EchoCodenamesActivityV1,
  fromUserId: string,
  revision: number,
): EchoCodenamesActivityV1 {
  return {
    ...prev,
    updatedAt: Date.now(),
    revision,
    fromUserId: fromUserId.trim(),
    phase: 'paused_requires_new_game',
    turnStage: 'na',
    currentClue: null,
    guessesRemaining: 0,
    lastEvent: 'key_lost',
  };
}
