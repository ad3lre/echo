import assert from 'node:assert/strict';
import type pg from 'pg';
import { ECHO_DM_REALM_SERVER_ID } from '../../domain/echoStore';
import { userMayRemainInLiveKitVoiceRoom } from '../echoVoiceAccessEnforcement';

async function run(): Promise<void> {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let dmJoinAllowed = false;
  let guildMember = false;
  let banned = false;
  let timeoutActive = false;
  let perms = new Set<string>();

  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      const p = params ?? [];
      calls.push({ sql: text, params: p });

      if (text.includes('echo_dm_threads') || text.includes('echo_group_dm')) {
        // userMayJoinDmLiveKitRoom probes — approximate with flag
        if (text.includes('echo_dm_threads') && text.includes('channel_id')) {
          return {
            rows: dmJoinAllowed ? [{ user_low: 'u1', user_high: 'u2' }] : [],
            rowCount: dmJoinAllowed ? 1 : 0,
          };
        }
        if (text.includes('echo_group_dm_members')) {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('echo_user_blocks')) {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('echo_dm_message_requests')) {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('echo_friendships') || text.includes('mutual')) {
          return {
            rows: dmJoinAllowed ? [{ ok: 1 }] : [],
            rowCount: dmJoinAllowed ? 1 : 0,
          };
        }
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('echo_server_members')) {
        return {
          rows: guildMember ? [{ '?column?': 1 }] : [],
          rowCount: guildMember ? 1 : 0,
        };
      }
      if (text.includes('echo_server_bans')) {
        return {
          rows: banned ? [{ '?column?': 1 }] : [],
          rowCount: banned ? 1 : 0,
        };
      }
      if (text.includes('timeout')) {
        return {
          rows: timeoutActive
            ? [{ timeout_until: new Date(Date.now() + 60_000).toISOString() }]
            : [],
          rowCount: timeoutActive ? 1 : 0,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Pool;

  // DM path: denied when join helper would fail (no thread row).
  dmJoinAllowed = false;
  assert.equal(
    await userMayRemainInLiveKitVoiceRoom(
      pool,
      ECHO_DM_REALM_SERVER_ID,
      'dm_ch',
      'u1',
    ),
    false,
  );

  // Guild path: not a member → denied.
  guildMember = false;
  assert.equal(
    await userMayRemainInLiveKitVoiceRoom(pool, 'srv1', 'vc1', 'u1'),
    false,
  );

  // Guild path with membership but no CONNECT — getEffectiveChannelPermissions
  // is heavy; when member+not banned the function still consults perms. Empty
  // perm SQL typically yields no VIEW/CONNECT → denied.
  guildMember = true;
  banned = false;
  timeoutActive = false;
  perms = new Set();
  const guildAllowed = await userMayRemainInLiveKitVoiceRoom(
    pool,
    'srv1',
    'vc1',
    'u1',
  );
  // Without a full role graph stub this should be false (no VIEW/CONNECT).
  assert.equal(guildAllowed, false);

  void perms;
  void calls;
  console.log('echo.livekitJoinAuthz.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
