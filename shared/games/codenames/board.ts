import type { CodenamesAffiliation, CodenamesPublicCell } from './types';

const PLACEHOLDER = '—';

export function emptyLobbyCells(): CodenamesPublicCell[] {
  return Array.from({ length: 25 }, () => ({
    revealed: false,
    word: PLACEHOLDER,
  }));
}

export function normalizeClueSurface(raw: string): string {
  const s = raw.normalize('NFC').trim().toUpperCase();
  return s.replace(/[^A-Z0-9]+/g, '');
}

function normalizeBoardWordForCompare(raw: string): string {
  return raw
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

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
  cells: readonly CodenamesPublicCell[],
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

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i]!;
    const b = arr[j]!;
    arr[i] = b;
    arr[j] = a;
  }
}

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
}): {
  words: string[];
  key: CodenamesAffiliation[];
  startingTeam: 'red' | 'blue';
} {
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
  const key: CodenamesAffiliation[] = Array(25).fill('neutral');
  for (let i = 0; i < 9; i++) key[idx[i]!] = startingTeam;
  for (let i = 0; i < 8; i++) key[idx[9 + i]!] = other;
  for (let i = 0; i < 7; i++) key[idx[17 + i]!] = 'neutral';
  key[idx[24]!] = 'assassin';

  return { words, key, startingTeam };
}

export function cellsFromWords(words: string[]): CodenamesPublicCell[] {
  return words.map((word) => ({ revealed: false, word }));
}
