/**
 * Run: node --import tsx backend/src/tests/paperCollabState.test.ts
 */
import assert from 'node:assert/strict';
import {
  channelWatchers,
  countPaperAuthors,
  isPaperCollabEnabled,
} from '../sockets/paperWatchState';

function reset() {
  channelWatchers.clear();
}

function testAuthorCountAndCollabGate(): void {
  reset();
  const channelId = 'ch-test';
  const map = new Map();
  map.set('u1', {
    userId: 'u1',
    displayName: 'A',
    authoring: true,
    socketIds: new Set(['s1']),
  });
  channelWatchers.set(channelId, map);
  assert.equal(countPaperAuthors(channelId), 1);
  assert.equal(isPaperCollabEnabled(channelId), false);

  map.set('u2', {
    userId: 'u2',
    displayName: 'B',
    authoring: true,
    socketIds: new Set(['s2']),
  });
  assert.equal(countPaperAuthors(channelId), 2);
  assert.equal(isPaperCollabEnabled(channelId), true);

  map.get('u2')!.authoring = false;
  assert.equal(isPaperCollabEnabled(channelId), false);
}

function run(): void {
  testAuthorCountAndCollabGate();
  console.log('paperCollabState.test: ok');
}

run();
