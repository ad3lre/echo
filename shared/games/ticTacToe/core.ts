/**
 * Pure tic-tac-toe rules. No transport, no Vue, no audio — shared verbatim by
 * the client (local CPU mode, optimistic render) and the authoritative game
 * server (`game-server/src/games/ticTacToe`). Relocated from
 * `frontend/src/features/voice/ticTacToe/ticTacToeCore.ts` (now a re-export shim).
 */

export type TttCell = '' | 'X' | 'O';
export type TttBoard = readonly TttCell[];

export const EMPTY_BOARD: TttBoard = ['', '', '', '', '', '', '', '', ''];

export function cloneBoard(b: TttBoard): TttCell[] {
  return [...b];
}

export function boardKey(b: TttBoard): string {
  return b.join('');
}

const WIN_LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function lineWinner(board: TttBoard): 'X' | 'O' | null {
  for (const line of WIN_LINES) {
    const [a, c, e] = line;
    const m = board[a];
    if (m && m === board[c] && m === board[e]) return m;
  }
  return null;
}

/** Cell indices forming a winning line, if any. */
export function winningLineIndices(board: TttBoard): number[] | null {
  for (const line of WIN_LINES) {
    const [a, c, e] = line;
    const m = board[a];
    if (m && m === board[c] && m === board[e]) return [a, c, e];
  }
  return null;
}

export function isBoardFull(board: TttBoard): boolean {
  return board.every((c) => c !== '');
}

export type TttTerminal = 'playing' | 'draw' | 'x_wins' | 'o_wins';

export function terminalFromBoard(board: TttBoard): TttTerminal {
  const w = lineWinner(board);
  if (w === 'X') return 'x_wins';
  if (w === 'O') return 'o_wins';
  if (isBoardFull(board)) return 'draw';
  return 'playing';
}

export function nextTurnAfter(mark: 'X' | 'O'): 'X' | 'O' {
  return mark === 'X' ? 'O' : 'X';
}

export function applyMoveIfLegal(
  board: TttBoard,
  cellIndex: number,
  mark: 'X' | 'O',
): TttCell[] | null {
  if (cellIndex < 0 || cellIndex > 8 || !Number.isInteger(cellIndex))
    return null;
  if (board[cellIndex] !== '') return null;
  if (terminalFromBoard(board) !== 'playing') return null;
  const next = cloneBoard(board);
  next[cellIndex] = mark;
  return next;
}

/** Lexicographic arbiter for Hangman-style VC authority. */
export function ticTacToeArbiterUserId(
  xUserId: string,
  oUserId: string,
): string {
  const x = xUserId.trim();
  const o = oUserId.trim();
  return x < o ? x : o;
}

function scoreMinimax(
  board: TttCell[],
  aiMark: 'X' | 'O',
  humanMark: 'X' | 'O',
  maximizing: boolean,
): number {
  const t = terminalFromBoard(board);
  if (t === 'draw') return 0;
  if (t === 'x_wins' || t === 'o_wins') {
    const w = t === 'x_wins' ? 'X' : 'O';
    return w === aiMark ? 1 : -1;
  }
  if (maximizing) {
    let best = -2;
    for (let i = 0; i < 9; i++) {
      if (board[i] !== '') continue;
      board[i] = aiMark;
      const s = scoreMinimax(board, aiMark, humanMark, false);
      board[i] = '';
      best = Math.max(best, s);
    }
    return best;
  }
  let best = 2;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== '') continue;
    board[i] = humanMark;
    const s = scoreMinimax(board, aiMark, humanMark, true);
    board[i] = '';
    best = Math.min(best, s);
  }
  return best;
}

/** Unbeatable move for `aiMark` (assumes `humanMark` is the opponent). */
export function bestMoveForAi(
  board: TttBoard,
  aiMark: 'X' | 'O',
): number | null {
  const humanMark: 'X' | 'O' = aiMark === 'X' ? 'O' : 'X';
  const b = cloneBoard(board);
  let bestI: number | null = null;
  let bestS = -2;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== '') continue;
    b[i] = aiMark;
    const s = scoreMinimax(b, aiMark, humanMark, false);
    b[i] = '';
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return bestI;
}

export type TttCpuDifficulty = 'easy' | 'medium' | 'hard';

export const TTT_CPU_DIFFICULTIES: readonly TttCpuDifficulty[] = [
  'easy',
  'medium',
  'hard',
];

export function pickRandomCpuDifficulty(
  rng: () => number = Math.random,
): TttCpuDifficulty {
  const i = Math.floor(rng() * TTT_CPU_DIFFICULTIES.length);
  return TTT_CPU_DIFFICULTIES[i] ?? 'medium';
}

export function cpuDifficultyLabel(d: TttCpuDifficulty): string {
  switch (d) {
    case 'easy':
      return 'casual';
    case 'medium':
      return 'tricky';
    case 'hard':
      return 'sharp';
  }
}

export function legalMoveIndices(board: TttBoard): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === '') moves.push(i);
  }
  return moves;
}

/** CPU move for the given per-game difficulty tier. */
export function moveForAi(
  board: TttBoard,
  aiMark: 'X' | 'O',
  difficulty: TttCpuDifficulty,
  rng: () => number = Math.random,
): number | null {
  const legal = legalMoveIndices(board);
  if (legal.length === 0) return null;

  if (difficulty === 'hard') return bestMoveForAi(board, aiMark);

  if (difficulty === 'easy') {
    return legal[Math.floor(rng() * legal.length)] ?? null;
  }

  const optimal = bestMoveForAi(board, aiMark);
  if (rng() < 0.65 && optimal != null) return optimal;
  const suboptimal = legal.filter((i) => i !== optimal);
  const pool = suboptimal.length > 0 ? suboptimal : legal;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}
