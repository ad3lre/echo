import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  createEchoServer,
  listEchoWorkspaceForUser,
  setEchoMemberNickname,
} from '../../domain/echoStore';

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `nick_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  const email = `${username}@nick.echo.test`;
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
      'Skipping echo.memberNickname: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `nick_owner_${Date.now().toString(36)}`;
  const memberId = `nick_mem_${Date.now().toString(36)}`;
  let serverId = '';
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId, 'Owner Display');
    await insertAuthUser(pool, memberId, 'Member Display');

    const created = await createEchoServer(pool, ownerId, 'nick-test');
    serverId = created.serverId;
    await addEchoServerMember(pool, serverId, memberId);

    const bad = await setEchoMemberNickname(
      pool,
      serverId,
      memberId,
      ownerId,
      'hax',
    );
    assert.equal(bad, 'forbidden');

    const ok = await setEchoMemberNickname(
      pool,
      serverId,
      ownerId,
      memberId,
      'ServerNick',
    );
    assert.equal(ok, 'ok');

    const ws = await listEchoWorkspaceForUser(pool, ownerId);
    const row = ws.membersByServer[serverId]?.find(
      (m) => m.userId === memberId,
    );
    assert.equal(row?.name, 'ServerNick');

    const cleared = await setEchoMemberNickname(
      pool,
      serverId,
      ownerId,
      memberId,
      '',
    );
    assert.equal(cleared, 'ok');
    const ws2 = await listEchoWorkspaceForUser(pool, ownerId);
    const row2 = ws2.membersByServer[serverId]?.find(
      (m) => m.userId === memberId,
    );
    assert.equal(row2?.name, 'Member Display');
  } finally {
    if (serverId)
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, memberId],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
