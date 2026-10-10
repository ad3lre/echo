import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  __setAttentionSnapshotBuilderForTests,
  flushEchoAttentionSnapshotSchedulerForTests,
  scheduleEchoAttentionSnapshotsForUsers,
} from '../../services/echoAttentionSnapshotScheduler';

describe('echoAttentionSnapshotScheduler', () => {
  it('dedupes user ids within a debounced flush', async () => {
    const emitted: string[] = [];
    const pool = {} as import('pg').Pool;
    __setAttentionSnapshotBuilderForTests(
      async (_pool, userId) =>
        ({
          userId,
        }) as never,
    );
    const io = {
      to: () => ({
        emit: (event: string, payload: unknown) => {
          if (event === 'attention:update') {
            emitted.push((payload as { userId: string }).userId);
          }
        },
      }),
    } as unknown as import('socket.io').Server;

    process.env.ECHO_ATTENTION_SNAPSHOT_DEBOUNCE_MS = '0';
    scheduleEchoAttentionSnapshotsForUsers(pool, io, ['u1', 'u1', 'u2']);
    await flushEchoAttentionSnapshotSchedulerForTests();
    assert.deepEqual(emitted.sort(), ['u1', 'u2']);
    __setAttentionSnapshotBuilderForTests(null);
  });
});
