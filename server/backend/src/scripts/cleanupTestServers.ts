/**
 * List and delete E2E / integration-test guild servers and orphaned test accounts.
 *
 * Dry-run:  node --import tsx server/backend/src/scripts/cleanupTestServers.ts
 * Delete:   node --import tsx server/backend/src/scripts/cleanupTestServers.ts --apply
 */
import type pg from 'pg';
import { getPgPool } from '../db/pg';

const APPLY = process.argv.includes('--apply');

/** Official Echo server — never delete. */
const PROTECTED_SERVER_IDS = new Set([
  '1499816749103710208', // Echo official
]);

function writeln(line: string): void {
  process.stdout.write(`${line}\n`);
}

function isTestServerName(name: string): boolean {
  const n = name.trim();
  if (!n || n === 'Echo') return false;
  return (
    /^E2EE\b/i.test(n) ||
    /^Voice (MLS|E2EE)/i.test(n) ||
    /^live race/i.test(n) ||
    /^dbg\d*$/i.test(n) ||
    /^LayoutDbg$/i.test(n) ||
    /^Layout\b/i.test(n) ||
    /^Slot\b/i.test(n) ||
    /^mls-srv$/i.test(n) ||
    /^ve2mls-stale$/i.test(n) ||
    /^rff$/i.test(n) ||
    /race server/i.test(n) ||
    /^e2e/i.test(n) ||
    /E2EE/i.test(n) ||
    /^encrypted-vc/i.test(n)
  );
}

function isTestUsername(username: string): boolean {
  const u = username.trim();
  return (
    /^(e2e|e2evc|e2eui|e2ecl|dbg|liverace|ve2mls|ve2race|rff_|layout_|slot_|mls_|csrf_)/i.test(
      u,
    ) ||
    /^ve2mls_(owner|peer|ve2mls_)/i.test(u) ||
    /^rff_rff_owner_/i.test(u)
  );
}

type TestServerRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_username: string | null;
};

async function listTestServers(pool: pg.Pool): Promise<TestServerRow[]> {
  const servers = await pool.query<TestServerRow>(`
    SELECT s.id, s.name, s.owner_id, u.username AS owner_username
    FROM echo_servers s
    LEFT JOIN auth_users u ON u.id = s.owner_id
    ORDER BY s.created_at DESC
  `);
  return servers.rows.filter((s) => {
    if (PROTECTED_SERVER_IDS.has(s.id)) return false;
    if (isTestServerName(s.name)) return true;
    return s.owner_username != null && isTestUsername(s.owner_username);
  });
}

async function listTestUsers(
  pool: pg.Pool,
): Promise<Array<{ id: string; username: string }>> {
  const users = await pool.query<{ id: string; username: string }>(`
    SELECT id, username FROM auth_users
    WHERE username ~* '^(e2e|e2evc|e2eui|e2ecl|dbg|liverace|ve2mls|ve2race|rff_|layout_|slot_|mls_|csrf_)'
       OR username ~* '^ve2mls_(owner|peer|ve2mls_)'
       OR username ~* '^rff_rff_owner_'
    ORDER BY created_at DESC
  `);
  return users.rows;
}

async function deleteTestServers(
  pool: pg.Pool,
  toDelete: TestServerRow[],
): Promise<number> {
  let deleted = 0;
  for (const s of toDelete) {
    const del = await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [
      s.id,
    ]);
    if (del.rowCount) {
      deleted += 1;
      writeln(`deleted server ${s.id} ("${s.name}")`);
    }
  }
  return deleted;
}

async function deleteTestUsers(
  pool: pg.Pool,
  users: Array<{ id: string; username: string }>,
): Promise<number> {
  let deleted = 0;
  for (const u of users) {
    if (!isTestUsername(u.username)) continue;
    const owned = await pool.query<{ id: string }>(
      `SELECT id FROM echo_servers WHERE owner_id = $1`,
      [u.id],
    );
    const blocking = owned.rows.filter((r) => !PROTECTED_SERVER_IDS.has(r.id));
    if (blocking.length > 0) {
      writeln(
        `skip user ${u.username} — still owns ${blocking.length} server(s)`,
      );
      continue;
    }
    await pool.query(`DELETE FROM echo_server_members WHERE user_id = $1`, [
      u.id,
    ]);
    await pool.query(`DELETE FROM echo_voice_participants WHERE user_id = $1`, [
      u.id,
    ]);
    const del = await pool.query(`DELETE FROM auth_users WHERE id = $1`, [
      u.id,
    ]);
    if (del.rowCount) {
      deleted += 1;
      writeln(`deleted user ${u.id} (${u.username})`);
    }
  }
  return deleted;
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL not configured — cannot connect.');
    process.exit(1);
  }

  const toDelete = await listTestServers(pool);
  const users = await listTestUsers(pool);

  writeln(APPLY ? 'DELETE mode' : 'DRY RUN (pass --apply to delete)');
  writeln(`test servers to remove: ${toDelete.length}`);
  for (const s of toDelete) {
    writeln(
      `  - ${s.id}  "${s.name}"  owner=${s.owner_username ?? s.owner_id}`,
    );
  }
  writeln(`test users to consider: ${users.length}`);

  if (!APPLY) {
    for (const u of users) {
      writeln(`  - ${u.id}  ${u.username}`);
    }
    await pool.end();
    process.exit(0);
  }

  const deletedServers = await deleteTestServers(pool, toDelete);
  const deletedUsers = await deleteTestUsers(pool, users);
  writeln(
    `\nDone: ${deletedServers} servers, ${deletedUsers} test users removed.`,
  );
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
