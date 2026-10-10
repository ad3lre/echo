import assert from 'node:assert/strict';
import { codenamesModule } from '../games/codenames';
import { skrigglesModule } from '../games/skriggles';
import { wordlineModule } from '../games/wordline';
import {
  applyReveal,
  buildBootstrapLobby,
  type CodenamesAffiliation,
} from '../../cores/games/codenames/core';
import {
  applyGuessToActivity,
  applySettingsChange,
  buildInitialSkrigglesLobby,
  computeSkrigglesGuessOutcome,
} from '../../cores/games/skriggles/core';
import { WORDLINE_ACTION } from '../../cores/games/wordline';

export async function runLedgerGameRulesTests() {
  const key: CodenamesAffiliation[] = Array(25).fill('red');
  key[0] = 'blue';
  const board = {
    ...buildBootstrapLobby({ rosterUserIds: ['a', 'b'] }),
    phase: 'playing' as const,
    turnStage: 'await_guess' as const,
    guessesRemaining: 2,
    roleAssignments: [
      { userId: 'a', team: 'red' as const, role: 'operative' as const },
    ],
  };
  const revealed = applyReveal(board, 'a', 0, key);
  assert.equal(revealed?.phase, 'game_over');
  assert.equal(revealed?.winner, 'blue');

  const lobby = buildInitialSkrigglesLobby({ rosterUserIds: ['a', 'b'] });
  const drawing = {
    ...lobby,
    phase: 'drawing' as const,
    drawerUserId: 'a',
    phaseEndsAt: 80_000,
  };
  const outcome = computeSkrigglesGuessOutcome({
    activity: drawing,
    secret: 'apple',
    guesserUserId: 'b',
    guessText: 'apple',
    nowMs: 1_000,
  });
  assert.ok(outcome);
  const finished = applyGuessToActivity(drawing, outcome, 'apple', 1_000);
  assert.equal(finished.phase, 'round_reveal');
  assert.equal(
    finished.chatLog.filter((entry) => entry.userId === 'b').length,
    1,
  );
  for (const invalid of [
    { drawTimeSec: 'bad' },
    { rounds: null },
    { wordPickSec: Infinity },
    { hints: 1 },
    { injected: true },
  ]) {
    assert.equal(applySettingsChange(lobby, invalid as never, 'a', 'a'), null);
  }
  assert.equal(
    applySettingsChange(lobby, { drawTimeSec: 30 }, 'a', 'a')?.settings
      .drawTimeSec,
    30,
  );

  const names = { ...board, roomId: 'room', words: null, key: null };
  const remaining = codenamesModule.onLeave!(names, 'a', 1_000)!;
  assert.deepEqual(remaining.rosterUserIds, ['b']);
  assert.deepEqual(remaining.roleAssignments, []);
  assert.equal(remaining.phase, 'paused_requires_new_game');
  const sketch = {
    ...drawing,
    rosterUserIds: ['a', 'b', 'c'],
    roundSecret: 'apple',
  };
  const nextDrawer = skrigglesModule.onLeave!(sketch, 'a', 1_000)!;
  assert.deepEqual(nextDrawer.rosterUserIds, ['b', 'c']);
  assert.equal(nextDrawer.phase, 'word_pick');
  assert.notEqual(nextDrawer.drawerUserId, 'a');
  assert.equal(nextDrawer.roundSecret, null);

  const context = {
    userId: 'a',
    roster: ['a'],
    now: 1_000,
    revision: 0,
    type: WORDLINE_ACTION.setMode,
  };
  let puzzle = wordlineModule.createInitialState({
    roomId: 'room',
    gameKey: 'wordle',
    now: 1_000,
  });
  puzzle = (await wordlineModule.reduce(puzzle, { mode: 'levels' }, context))!;
  puzzle = (await wordlineModule.reduce(
    puzzle,
    { guess: puzzle.byUser.a!.solution },
    { ...context, type: WORDLINE_ACTION.submitGuess },
  ))!;
  assert.equal(puzzle.byUser.a!.level, 1);
  puzzle = (await wordlineModule.reduce(puzzle, { mode: 'levels' }, context))!;
  assert.equal(puzzle.byUser.a!.level, 1);
  assert.equal(puzzle.byUser.a!.status, 'playing');
  console.info('ledger game rules: OK');
}
