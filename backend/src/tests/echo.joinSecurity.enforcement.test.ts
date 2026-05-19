import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  createEchoServer,
  joinEchoServerFromDirectory,
} from '../domain/echoStore';

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `joinsec_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@joinsec.echo.test`;
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
      'Skipping echo.joinSecurity.enforcement: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ts = Date.now().toString(36);
  const ownerId = `join_owner_${ts}`;
  const candidateId = `join_candidate_${ts}`;
  const altJoinerId = `join_alt_${ts}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId, 'Join Owner');
    await insertAuthUser(pool, candidateId, 'Join Candidate');
    await insertAuthUser(pool, altJoinerId, 'Join Alt');

    const created = await createEchoServer(pool, ownerId, 'join-security-test');
    serverId = created.serverId;

    // Directory joins must be denied if server is not listed.
    await pool.query(
      `UPDATE echo_servers SET listed_in_directory = false WHERE id = $1`,
      [serverId],
    );
    const notListed = await joinEchoServerFromDirectory(
      pool,
      serverId,
      candidateId,
    );
    assert.deepEqual(notListed, { ok: false, reason: 'not_listed' });

    const notListedMembership = await pool.query(
      `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, candidateId],
    );
    assert.equal(
      notListedMembership.rows.length,
      0,
      'user must not be inserted when directory join is disallowed',
    );

    // Directory joins must be denied for banned users even when listed.
    await pool.query(
      `UPDATE echo_servers SET listed_in_directory = true WHERE id = $1`,
      [serverId],
    );
    await pool.query(
      `
      INSERT INTO echo_server_bans (server_id, user_id, expires_at, reason, banned_by, created_at)
      VALUES ($1, $2, NULL, 'test ban', $3, NOW())
      ON CONFLICT (server_id, user_id) DO UPDATE SET expires_at = NULL, reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, created_at = NOW()
      `,
      [serverId, candidateId, ownerId],
    );
    const banned = await joinEchoServerFromDirectory(
      pool,
      serverId,
      candidateId,
    );
    assert.deepEqual(banned, { ok: false, reason: 'banned' });

    const bannedMembership = await pool.query(
      `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, candidateId],
    );
    assert.equal(
      bannedMembership.rows.length,
      0,
      'banned user must not be inserted as server member',
    );

    // IP bans: a different account on the same client IP must not join.
    await pool.query(
      `DELETE FROM echo_server_bans WHERE server_id = $1 AND user_id = $2`,
      [serverId, candidateId],
    );
    await pool.query(`UPDATE auth_users SET last_seen_ip = $1 WHERE id = $2`, [
      '203.0.113.77',
      candidateId,
    ]);
    await pool.query(
      `
      INSERT INTO echo_server_ip_bans (
        server_id, ip, banned_user_id, expires_at, reason, banned_by, created_at
      )
      VALUES ($1, $2::inet, $3, NULL, 'ip test', $4, NOW())
      ON CONFLICT (server_id, ip) DO UPDATE SET
        banned_user_id = EXCLUDED.banned_user_id,
        expires_at = EXCLUDED.expires_at,
        reason = EXCLUDED.reason,
        banned_by = EXCLUDED.banned_by,
        created_at = NOW()
      `,
      [serverId, '203.0.113.77', candidateId, ownerId],
    );
    const ipBanned = await joinEchoServerFromDirectory(
      pool,
      serverId,
      altJoinerId,
      '203.0.113.77',
    );
    assert.deepEqual(ipBanned, { ok: false, reason: 'banned' });

    console.log('echo.joinSecurity.enforcement: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, candidateId, altJoinerId],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
