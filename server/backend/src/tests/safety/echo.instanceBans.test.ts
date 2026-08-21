import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureAuthTables } from '../../db/authTables';
import { ensureEchoTables } from '../../db/echoTables';
import {
  createInstanceBan,
  evaluateInstanceBan,
  listInstanceBans,
  revokeInstanceBan,
  setUserInstanceOperator,
} from '../../domain/echoStore/safety/instanceBans';

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `ib_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@instanceban.echo.test`;
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
      'Skipping echo.instanceBans: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ts = Date.now().toString(36);
  const operatorId = `ib_op_${ts}`;
  const targetId = `ib_target_${ts}`;
  const otherId = `ib_other_${ts}`;
  const banIds: string[] = [];

  try {
    await ensureAuthTables(pool);
    await ensureEchoTables(pool);
    await insertAuthUser(pool, operatorId, 'Instance Op');
    await insertAuthUser(pool, targetId, 'Ban Target');
    await insertAuthUser(pool, otherId, 'Other User');

    await setUserInstanceOperator(pool, operatorId, true, operatorId);

    const clear = await evaluateInstanceBan(pool, { userId: targetId });
    assert.equal(clear.blocked, false);

    const created = await createInstanceBan(pool, {
      reason: 'integration test ban',
      userId: targetId,
      includeLastSeenIp: false,
      includeKnownHwid: false,
      bannedBy: operatorId,
    });
    assert.ok(created.length >= 1);
    banIds.push(...created.map((b) => b.id));

    const blocked = await evaluateInstanceBan(pool, { userId: targetId });
    assert.equal(blocked.blocked, true);
    assert.ok(blocked.hits.includes('userId'));

    const ipBan = await createInstanceBan(pool, {
      reason: 'ip ban test',
      rawIp: '203.0.113.55',
      includeLastSeenIp: false,
      includeKnownHwid: false,
      bannedBy: operatorId,
    });
    banIds.push(...ipBan.map((b) => b.id));

    const ipBlocked = await evaluateInstanceBan(pool, {
      rawIp: '203.0.113.55',
    });
    assert.equal(ipBlocked.blocked, true);
    assert.ok(ipBlocked.hits.includes('ip'));

    const allow = await createInstanceBan(pool, {
      reason: 'allow office ip',
      rawIp: '203.0.113.55',
      isAllowlisted: true,
      includeLastSeenIp: false,
      includeKnownHwid: false,
      bannedBy: operatorId,
    });
    banIds.push(...allow.map((b) => b.id));

    const ipAllowed = await evaluateInstanceBan(pool, {
      rawIp: '203.0.113.55',
    });
    assert.equal(ipAllowed.blocked, false);

    const expired = await createInstanceBan(pool, {
      reason: 'expired ban',
      userId: otherId,
      expiresAt: new Date(Date.now() - 60_000),
      includeLastSeenIp: false,
      includeKnownHwid: false,
      bannedBy: operatorId,
    });
    banIds.push(...expired.map((b) => b.id));

    const expiredCheck = await evaluateInstanceBan(pool, { userId: otherId });
    assert.equal(expiredCheck.blocked, false);

    const revoked = await revokeInstanceBan(pool, created[0]!.id, operatorId);
    assert.ok(revoked);
    assert.ok(revoked!.revokedAt);

    const unblocked = await evaluateInstanceBan(pool, { userId: targetId });
    assert.equal(unblocked.blocked, false);

    const listed = await listInstanceBans(pool, {
      userId: targetId,
      limit: 10,
    });
    assert.ok(
      listed.bans.every(
        (b) =>
          b.revokedAt != null ||
          b.userId !== targetId ||
          b.id !== created[0]!.id,
      ),
    );

    console.log('echo.instanceBans.test: ok');
  } finally {
    if (banIds.length) {
      await pool.query(
        `DELETE FROM echo_instance_ban_audit WHERE ban_id = ANY($1::text[])`,
        [banIds],
      );
      await pool.query(
        `DELETE FROM echo_instance_bans WHERE id = ANY($1::text[])`,
        [banIds],
      );
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [operatorId, targetId, otherId],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
