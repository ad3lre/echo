import assert from 'node:assert/strict';
import {
  EMPTY_BOARD,
  applyMoveIfLegal,
  terminalFromBoard,
} from '../../cores/games/ticTacToe/core';

/**
 * Contract vectors shared with the opt-in HolyC core. Keeping these vectors in
 * the activities test suite prevents the experimental engine from silently
 * drifting from Echo's authoritative TypeScript rules.
 */
export function runHolyCTicTacToeContractTests(): void {
  let board = [...EMPTY_BOARD];
  board = applyMoveIfLegal(board, 0, 'X')!;
  board = applyMoveIfLegal(board, 3, 'O')!;
  board = applyMoveIfLegal(board, 1, 'X')!;
  board = applyMoveIfLegal(board, 4, 'O')!;
  board = applyMoveIfLegal(board, 2, 'X')!;

  assert.equal(terminalFromBoard(board), 'x_wins');
  assert.equal(applyMoveIfLegal(board, 8, 'O'), null);
  assert.equal(applyMoveIfLegal([...EMPTY_BOARD], 9, 'X'), null);
  assert.equal(applyMoveIfLegal(board, 0, 'O'), null);

  console.log('✓ holycTicTacToeContract: 4 assertions passed');
}
