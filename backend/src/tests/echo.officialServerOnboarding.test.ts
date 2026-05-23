import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { config } from '../config';
import { ensureEchoTables } from '../db/echoTables';
import { createEchoServer } from '../domain/echoStore';
import {
  joinNewAccountToOfficialEchoServer,
  resetOfficialEchoServerIdCacheForTests,
} from '../domain/echoStore/officialServerOnboarding';

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `off_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@official.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, displayName, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.officialServerOnboarding: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ts = Date.now().toString(36);
  const ownerId = `off_owner_${ts}`;
  const newUserId = `off_new_${ts}`;
  const prevOfficialId = config.echoOfficialServerId;

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId, 'Official Owner');
    await insertAuthUser(pool, newUserId, 'Official New');

    const created = await createEchoServer(
      pool,
      ownerId,
      'official-onboarding-test',
    );
    Object.defineProperty(config, 'echoOfficialServerId', {
      value: created.serverId,
      writable: true,
      configurable: true,
    });
    resetOfficialEchoServerIdCacheForTests();

    const first = await joinNewAccountToOfficialEchoServer(pool, newUserId);
    assert.equal(first.joined, true);
    assert.equal(first.serverId, created.serverId);

    const mem = await pool.query(
      `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
      [created.serverId, newUserId],
    );
    assert.equal(mem.rows.length, 1);

    const second = await joinNewAccountToOfficialEchoServer(pool, newUserId);
    assert.equal(second.joined, false);

    console.log('echo.officialServerOnboarding.test: ok');
  } finally {
    Object.defineProperty(config, 'echoOfficialServerId', {
      value: prevOfficialId,
      writable: true,
      configurable: true,
    });
    resetOfficialEchoServerIdCacheForTests();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
