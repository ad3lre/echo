import assert from 'node:assert/strict';
import {
  assertVcWatchTogetherSessionQuota,
  addVcWatchTogetherSessionBytes,
  getVcWatchTogetherSessionBytesUsed,
  isVcWatchTogetherStorageKey,
  releaseVcWatchTogetherSessionBytes,
} from '../services/vcWatchTogetherSessions';
import { ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES } from '../../../shared/echoPlanLimits';

async function run(): Promise<void> {
  assert.equal(
    isVcWatchTogetherStorageKey('echo/vc-watch/ch/u/file.mp4'),
    true,
  );
  assert.equal(
    isVcWatchTogetherStorageKey('echo/channels/ch/u/file.mp4'),
    false,
  );

  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO echo_vc_watch_together_sessions')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT bytes_used')) {
        return { rows: [{ bytes_used: '1000', host_user_id: 'user-1' }] };
      }
      if (sql.includes('bytes_used = GREATEST')) {
        assert.equal(params?.[1], 200);
        return { rows: [] };
      }
      if (sql.includes('bytes_used = bytes_used +')) {
        assert.equal(params?.[1], 500);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const ok = await assertVcWatchTogetherSessionQuota(pool as never, {
    sessionId: 'sess-1',
    hostUserId: 'user-1',
    channelId: 'ch-1',
    additionalBytes: 100,
  });
  assert.equal(ok.ok, true);

  const used = await getVcWatchTogetherSessionBytesUsed(
    pool as never,
    'sess-1',
  );
  assert.equal(used, 1000);

  await addVcWatchTogetherSessionBytes(pool as never, {
    sessionId: 'sess-1',
    hostUserId: 'user-1',
    channelId: 'ch-1',
    byteLength: 500,
  });

  const over = await assertVcWatchTogetherSessionQuota(pool as never, {
    sessionId: 'sess-2',
    hostUserId: 'user-1',
    channelId: 'ch-1',
    additionalBytes: ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES,
  });
  assert.equal(over.ok, false);

  const released = await releaseVcWatchTogetherSessionBytes(pool as never, {
    sessionId: 'sess-1',
    hostUserId: 'user-1',
    byteLength: 200,
  });
  assert.equal(released.ok, true);

  const denied = await releaseVcWatchTogetherSessionBytes(pool as never, {
    sessionId: 'sess-1',
    hostUserId: 'other-user',
    byteLength: 200,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'NOT_HOST');

  console.log('vcWatchTogetherSessions.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
