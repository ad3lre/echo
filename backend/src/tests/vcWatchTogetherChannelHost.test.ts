/**
 * VC Watch Together per-channel host lock.
 * Run: node --import tsx backend/src/tests/vcWatchTogetherChannelHost.test.ts
 */
import assert from 'node:assert/strict';
import {
  claimVcWatchTogetherChannelHost,
  releaseVcWatchTogetherChannelHost,
  getVcWatchTogetherChannelHost,
} from '../services/vcWatchTogetherChannelHost';

async function run(): Promise<void> {
  const rows = new Map<
    string,
    { host_user_id: string; session_id: string; updated_at: Date }
  >();

  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      const channelId = String(params?.[0] ?? '');
      if (
        sql.includes(
          'SELECT host_user_id FROM echo_vc_watch_together_channel_hosts',
        ) &&
        sql.includes('host_user_id <>')
      ) {
        const self = String(params?.[1] ?? '');
        const row = rows.get(channelId);
        if (row && row.host_user_id !== self) {
          return { rows: [{ host_user_id: row.host_user_id }] };
        }
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO echo_vc_watch_together_channel_hosts')) {
        const host = String(params?.[1] ?? '');
        const session = String(params?.[2] ?? '');
        rows.set(channelId, {
          host_user_id: host,
          session_id: session,
          updated_at: new Date(),
        });
        return { rows: [] };
      }
      if (
        sql.includes('SELECT host_user_id, session_id') &&
        sql.includes('updated_at >=')
      ) {
        const row = rows.get(channelId);
        return row
          ? {
              rows: [
                {
                  host_user_id: row.host_user_id,
                  session_id: row.session_id,
                },
              ],
            }
          : { rows: [] };
      }
      if (
        sql.includes(
          'SELECT host_user_id FROM echo_vc_watch_together_channel_hosts',
        ) &&
        sql.includes('LIMIT 1') &&
        !sql.includes('host_user_id <>')
      ) {
        const row = rows.get(channelId);
        return row
          ? {
              rows: [
                {
                  host_user_id: row.host_user_id,
                  session_id: row.session_id,
                },
              ],
            }
          : { rows: [] };
      }
      if (sql.includes('DELETE FROM echo_vc_watch_together_channel_hosts')) {
        const host = String(params?.[1] ?? '');
        const row = rows.get(channelId);
        if (row?.host_user_id === host) {
          rows.delete(channelId);
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }
      return { rows: [] };
    },
  };

  const first = await claimVcWatchTogetherChannelHost(pool as never, {
    channelId: 'ch-1',
    hostUserId: 'user-a',
    sessionId: 'sess-a',
  });
  assert.equal(first.ok, true);

  const blocked = await claimVcWatchTogetherChannelHost(pool as never, {
    channelId: 'ch-1',
    hostUserId: 'user-b',
    sessionId: 'sess-b',
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.code, 'HOST_TAKEN');
    assert.equal(blocked.hostUserId, 'user-a');
  }

  const host = await getVcWatchTogetherChannelHost(pool as never, 'ch-1');
  assert.deepEqual(host, { hostUserId: 'user-a', sessionId: 'sess-a' });

  const released = await releaseVcWatchTogetherChannelHost(pool as never, {
    channelId: 'ch-1',
    hostUserId: 'user-a',
  });
  assert.equal(released, true);

  const second = await claimVcWatchTogetherChannelHost(pool as never, {
    channelId: 'ch-1',
    hostUserId: 'user-b',
    sessionId: 'sess-b',
  });
  assert.equal(second.ok, true);

  console.log('vcWatchTogetherChannelHost.test.ts ok');
}

void run();
