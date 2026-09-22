import assert from 'node:assert/strict';
import process from 'node:process';
import { join } from 'node:path';
import { HolyCTicTacToeEngine } from '../games/ticTacToe/holycEngine';

export async function runHolyCEngineTests(): Promise<void> {
  const engine = new HolyCTicTacToeEngine({
    command: process.execPath,
    args: [join(__dirname, 'fixtures', 'holycTicTacToeEngine.js')],
    timeoutMs: 500,
  });
  try {
    const x0 = await engine.apply(1, 0, 'X');
    assert.equal(x0?.board[0], 'X');
    assert.equal(x0?.currentTurn, 'O');

    assert.equal(await engine.apply(2, 1, 'X'), null);
    const o3 = await engine.apply(3, 3, 'O');
    assert.equal(o3?.board[3], 'O');
    assert.equal(await engine.apply(4, 0, 'X'), null);
  } finally {
    engine.dispose();
  }

  const malformed = new HolyCTicTacToeEngine({
    command: process.execPath,
    args: [join(__dirname, 'fixtures', 'holycMalformedEngine.js')],
    timeoutMs: 500,
  });
  try {
    await assert.rejects(
      () => malformed.apply(1, 0, 'X'),
      /malformed response/,
    );
  } finally {
    malformed.dispose();
  }

  console.log(
    '✓ holycEngine: supervised protocol, rejection, state, and fail-closed parsing passed',
  );
}
