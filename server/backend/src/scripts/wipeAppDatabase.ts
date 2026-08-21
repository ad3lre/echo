/**
 * Deletes all Echo app data in Postgres (users, servers, messages, sessions, audit, etc.)
 * while keeping table definitions, indexes, and extensions intact.
 *
 *   npx ts-node src/scripts/wipeAppDatabase.ts           # dry-run (lists tables)
 *   npx ts-node src/scripts/wipeAppDatabase.ts --execute # apply
 *
 * Env: `DATABASE_URL` (same as the running server). Loads repo root `.env`, then `server/backend/.env`, then `.env.lan`.
 */
import { config } from '../config';
import { closePgPool, getPgPool } from '../db/pg';

const execute = process.argv.includes('--execute');

function sanitizeDatabaseUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(could not parse DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  console.log(
    `ECHO_BACKEND_STORAGE=${config.backendStorageMode} (must be postgres for a real wipe)`,
  );

  const pool = getPgPool();
  if (!pool) {
    console.error(
      'DATABASE_URL is not set or ECHO_BACKEND_STORAGE is not postgres; nothing to do.',
    );
    process.exit(1);
  }

  if (config.databaseUrl) {
    console.log(
      `Target database: ${sanitizeDatabaseUrlForLog(config.databaseUrl)}`,
    );
  }

  const { rows } = await pool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename ~ '^auth_' OR tablename ~ '^echo_')
    ORDER BY tablename
  `);

  if (rows.length === 0) {
    console.log(
      'No auth_* / echo_* tables found in public schema (already empty schema?).',
    );
    await closePgPool();
    return;
  }

  for (const r of rows) {
    if (!/^[a-z0-9_]+$/.test(r.tablename)) {
      console.error(`Refusing unsafe table name: ${r.tablename}`);
      process.exit(1);
    }
  }

  const quoted = rows.map((r) => `"${r.tablename}"`).join(', ');
  console.log(
    `${execute ? 'Truncating' : 'Would truncate'} ${rows.length} table(s):`,
  );
  for (const r of rows) console.log(`  · ${r.tablename}`);

  if (!execute) {
    console.log('\nDry run. Re-run with --execute to wipe data.');
    await closePgPool();
    return;
  }

  await pool.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

  const counts = await pool.query<{
    n_auth: string;
    n_servers: string;
    n_messages: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM auth_users) AS n_auth,
       (SELECT COUNT(*)::text FROM echo_servers) AS n_servers,
       (SELECT COUNT(*)::text FROM echo_messages) AS n_messages`,
  );
  const row = counts.rows[0];
  console.log(
    `\nPost-wipe counts (expect 0): auth_users=${row?.n_auth ?? '?'} echo_servers=${row?.n_servers ?? '?'} echo_messages=${row?.n_messages ?? '?'}`,
  );

  console.log(
    '\nDone. Schema unchanged; register a new account and recreate servers as needed.',
  );
  await closePgPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
