import { describe, expect, it } from 'vitest';
import {
  bestMoveForAi,
  cpuDifficultyLabel,
  legalMoveIndices,
  moveForAi,
  pickRandomCpuDifficulty,
  type TttBoard,
} from '@/features/voice/ticTacToe/ticTacToeCore';

function board(cells: string): TttBoard {
  if (cells.length !== 9) throw new Error('board string must be 9 chars');
  return cells
    .split('')
    .map((c) => (c === '.' || c === ' ' ? '' : c)) as TttBoard;
}

describe('ticTacToeCore CPU difficulty', () => {
  it('labels difficulty tiers for display', () => {
    expect(cpuDifficultyLabel('easy')).toBe('casual');
    expect(cpuDifficultyLabel('medium')).toBe('tricky');
    expect(cpuDifficultyLabel('hard')).toBe('sharp');
  });

  it('picks uniformly among difficulty tiers', () => {
    expect(pickRandomCpuDifficulty(() => 0)).toBe('easy');
    expect(pickRandomCpuDifficulty(() => 0.34)).toBe('medium');
    expect(pickRandomCpuDifficulty(() => 0.67)).toBe('hard');
  });

  it('lists legal moves', () => {
    expect(legalMoveIndices(board('XOX.O....'))).toEqual([3, 5, 6, 7, 8]);
  });

  it('hard AI blocks an immediate human win', () => {
    const b = board('XX.......');
    expect(bestMoveForAi(b, 'O')).toBe(2);
    expect(moveForAi(b, 'O', 'hard')).toBe(2);
  });

  it('easy AI picks a random legal cell', () => {
    const b = board('XX.......');
    const seq = [0.99];
    let i = 0;
    const rng = () => seq[i++] ?? 0;
    expect(moveForAi(b, 'O', 'easy', rng)).toBe(8);
  });

  it('medium AI usually plays optimally but can slip', () => {
    const b = board('XX.......');
    expect(moveForAi(b, 'O', 'medium', () => 0)).toBe(2);
    const seq = [0.7, 0.99];
    let i = 0;
    const rng = () => seq[i++] ?? 0;
    expect(moveForAi(b, 'O', 'medium', rng)).toBe(8);
  });
});
