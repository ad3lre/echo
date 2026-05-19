import type { EchoWordleCellPersistState } from '@/features/voice/echoWordleAccountStore';

const SQUARE = {
  correct: '🟩',
  present: '🟨',
  absent: '⬜',
} as const;

function cellToSquare(st: EchoWordleCellPersistState): string | null {
  if (st === 'correct') return SQUARE.correct;
  if (st === 'present') return SQUARE.present;
  if (st === 'absent') return SQUARE.absent;
  return null;
}

/** Human label for share header (local date of the puzzle day key `y-m-d`). */
export function echoWordleShareDateLabel(dayKey: string): string {
  const parts = dayKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return dayKey;
  }
  const [y, m, d] = parts as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildEchoWordleDiscordShareLines(opts: {
  dayKey: string;
  won: boolean;
  /** Number of submitted rows (1–6). */
  usedRows: number;
  /** Only rows that were committed (each cell correct / present / absent). */
  gridRows: { state: EchoWordleCellPersistState }[][];
  displayName?: string | null;
}): string {
  const titleBits = [`Wordline · ${echoWordleShareDateLabel(opts.dayKey)}`];
  if (opts.displayName?.trim()) {
    titleBits.push(opts.displayName.trim());
  }
  const score = opts.won ? `${opts.usedRows}/6` : `X/6`;
  const lines: string[] = [`${titleBits.join(' · ')}  ${score}`, ''];
  for (const row of opts.gridRows) {
    let line = '';
    for (const cell of row) {
      const sq = cellToSquare(cell.state);
      if (!sq) {
        line = '';
        break;
      }
      line += sq;
    }
    if (line.length === 5) lines.push(line);
  }
  return lines.join('\n');
}
