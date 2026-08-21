import assert from 'node:assert/strict';
import { canModerateServer } from '../../domain/echoPolicy';
import { getEchoStore } from '../../domain/echoStore';
import { canUserPostMessage } from '../../domain/permissions/echoPermissions';

/**
 * Lightweight pipeline check: Echo store + permission helpers when PostgreSQL is available.
 * Run from repo: `npm run test:echo -w backend` (requires DATABASE_URL and seeded `echo_channels` / `auth_users`).
 */
async function run(): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) {
    console.log(
      'echo.messaging.integration: skip (Echo disabled or no DATABASE_URL)',
    );
    return;
  }

  const ch = await pool.query(`SELECT id FROM echo_channels LIMIT 1`);
  const channelId = ch.rows[0] ? String(ch.rows[0].id) : null;
  const au = await pool.query(`SELECT id FROM auth_users LIMIT 1`);
  const userId = au.rows[0] ? String(au.rows[0].id) : null;

  if (!channelId || !userId) {
    console.log(
      'echo.messaging.integration: skip (need at least one echo_channels row and auth_users row)',
    );
    return;
  }

  const ok = await canUserPostMessage(pool, userId, channelId);
  assert.equal(typeof ok, 'boolean');
  const srv = await pool.query(
    `SELECT server_id FROM echo_channels WHERE id = $1`,
    [channelId],
  );
  const serverId = srv.rows[0] ? String(srv.rows[0].server_id) : '';
  if (serverId) {
    const mod = await canModerateServer(pool, userId, serverId);
    assert.equal(typeof mod, 'boolean');
  }
  console.log('echo.messaging.integration: ok');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
