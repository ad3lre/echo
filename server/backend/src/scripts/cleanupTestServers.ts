/**
 * Carefully delete explicitly selected old E2E / integration fixtures.
 *
 * Preview: export ECHO_TEST_CLEANUP_SERVER_IDS=... and/or
 *         ECHO_TEST_CLEANUP_USER_IDS=..., then run this script.
 * Apply:  repeat with --apply --confirm-plan=<hash printed by the preview>.
 */
import { createHash } from 'node:crypto';
import { config } from '../config';
import { closePgPool, getPgPool } from '../db/pg';

const APPLY = process.argv.includes('--apply');
const confirmation = process.argv
  .find((arg) => arg.startsWith('--confirm-plan='))
  ?.slice('--confirm-plan='.length);
const protectedServerIds = new Set(['1499816749103710208']);

function readIds(name: string): string[] {
  return [
    ...new Set(
      (process.env[name] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function planHash(serverIds: string[], userIds: string[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        serverIds: [...serverIds].sort(),
        userIds: [...userIds].sort(),
      }),
    )
    .digest('hex');
}

function refuseProductionDatabase(): void {
  const raw = process.env.DATABASE_URL ?? '';
  let databaseName = '';
  let host = '';
  try {
    const parsed = new URL(raw);
    databaseName = parsed.pathname.toLowerCase();
    host = parsed.hostname.toLowerCase();
  } catch {
    throw new Error('DATABASE_URL must be a valid URL');
  }
  if (
    config.isProduction ||
    process.env.NODE_ENV === 'production' ||
    /(^|[-_.])(prod|production)([-_.]|$)/.test(`${host}${databaseName}`)
  ) {
    throw new Error('Refusing cleanup against a production-shaped database');
  }
}

async function main(): Promise<void> {
  refuseProductionDatabase();
  const serverIds = readIds('ECHO_TEST_CLEANUP_SERVER_IDS');
  const userIds = readIds('ECHO_TEST_CLEANUP_USER_IDS');
  if (serverIds.length + userIds.length === 0) {
    throw new Error(
      'Supply exact server/user IDs through the cleanup manifest environment variables',
    );
  }
  if (serverIds.some((id) => protectedServerIds.has(id))) {
    throw new Error('Cleanup manifest contains a protected server ID');
  }

  const pool = getPgPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const expectedHash = planHash(serverIds, userIds);
  const [servers, users] = await Promise.all([
    serverIds.length
      ? pool.query<{
          id: string;
          name: string;
          owner_id: string;
          created_at: Date;
        }>(
          `SELECT id, name, owner_id, created_at FROM echo_servers
           WHERE id = ANY($1::text[]) AND created_at < NOW() - INTERVAL '1 day'
           ORDER BY id`,
          [serverIds],
        )
      : Promise.resolve({
          rows: [] as {
            id: string;
            name: string;
            owner_id: string;
            created_at: Date;
          }[],
        }),
    userIds.length
      ? pool.query<{ id: string; username: string; created_at: Date }>(
          `SELECT id, username, created_at FROM auth_users
           WHERE id = ANY($1::text[]) AND created_at < NOW() - INTERVAL '1 day'
           ORDER BY id`,
          [userIds],
        )
      : Promise.resolve({
          rows: [] as { id: string; username: string; created_at: Date }[],
        }),
  ]);
  if (
    servers.rows.length !== serverIds.length ||
    users.rows.length !== userIds.length
  ) {
    throw new Error('Every manifest ID must exist and be at least one day old');
  }

  process.stdout.write(`${APPLY ? 'DELETE PLAN' : 'DRY RUN'}\n`);
  for (const server of servers.rows) {
    process.stdout.write(
      `server ${server.id} ${JSON.stringify(server.name)} owner=${server.owner_id}\n`,
    );
  }
  for (const user of users.rows) {
    process.stdout.write(`user ${user.id} ${JSON.stringify(user.username)}\n`);
  }
  process.stdout.write(`plan hash: ${expectedHash}\n`);
  if (!APPLY) {
    await pool.end();
    return;
  }
  if (confirmation !== expectedHash) {
    throw new Error(
      'Apply requires --confirm-plan with the hash from the reviewed dry run',
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id FROM echo_servers
       WHERE id = ANY($1::text[]) AND created_at < NOW() - INTERVAL '1 day'
       FOR UPDATE`,
      [serverIds],
    );
    if (locked.rows.length !== serverIds.length)
      throw new Error('Server manifest changed after preview');
    const lockedUsers = await client.query(
      `SELECT id FROM auth_users
       WHERE id = ANY($1::text[]) AND created_at < NOW() - INTERVAL '1 day'
       FOR UPDATE`,
      [userIds],
    );
    if (lockedUsers.rows.length !== userIds.length)
      throw new Error('User manifest changed after preview');
    if (userIds.length) {
      const stillOwned = await client.query(
        `SELECT id FROM echo_servers
         WHERE owner_id = ANY($1::text[]) AND NOT (id = ANY($2::text[]))
         FOR UPDATE`,
        [userIds, serverIds],
      );
      if (stillOwned.rows.length)
        throw new Error(
          'A selected user still owns a server outside this manifest',
        );
    }
    if (serverIds.length)
      await client.query(
        `DELETE FROM echo_servers WHERE id = ANY($1::text[])`,
        [serverIds],
      );
    if (userIds.length) {
      await client.query(
        `DELETE FROM echo_server_members WHERE user_id = ANY($1::text[])`,
        [userIds],
      );
      await client.query(
        `DELETE FROM echo_voice_participants WHERE user_id = ANY($1::text[])`,
        [userIds],
      );
      await client.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
        userIds,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  void closePgPool().finally(() => {
    process.exitCode = 1;
  });
});
