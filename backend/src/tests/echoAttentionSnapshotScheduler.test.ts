import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flushEchoAttentionSnapshotSchedulerForTests,
  scheduleEchoAttentionSnapshotsForUsers,
} from '../services/echoAttentionSnapshotScheduler';

describe('echoAttentionSnapshotScheduler', () => {
  it('dedupes user ids within a debounced flush', async () => {
    const emitted: string[] = [];
    const pool = {} as import('pg').Pool;
    const io = {
      to: () => ({
        emit: (_event: string, _payload: unknown) => {
          /* no-op until build runs */
        },
      }),
    } as unknown as import('socket.io').Server;

    process.env.ECHO_ATTENTION_SNAPSHOT_DEBOUNCE_MS = '0';
    scheduleEchoAttentionSnapshotsForUsers(pool, io, ['u1', 'u1', 'u2']);
    await flushEchoAttentionSnapshotSchedulerForTests();
    assert.equal(emitted.length, 0);
  });
});
