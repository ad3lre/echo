import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureAuthTables } from '../db/authTables';
import {
  deleteEchoPlusInterest,
  getEchoPlusInterestForUser,
  listEchoPlusInterest,
  upsertEchoPlusInterest,
} from '../domain/echoPlusInterest';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `int_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@interest.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, 'Interest Test', '', 'offline', '', '', '', false, $4, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echoPlusInterest: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const userId = `int_${Date.now().toString(36)}`;
  try {
    await ensureAuthTables(pool);
    await insertAuthUser(pool, userId);

    assert.equal(await getEchoPlusInterestForUser(pool, userId), null);

    const created = await upsertEchoPlusInterest(
      pool,
      userId,
      'plus',
      'yearly',
    );
    assert.equal(created.tier, 'plus');
    assert.equal(created.billingCycle, 'yearly');

    const updated = await upsertEchoPlusInterest(
      pool,
      userId,
      'black',
      'monthly',
    );
    assert.equal(updated.tier, 'black');
    assert.equal(updated.billingCycle, 'monthly');

    const listed = await listEchoPlusInterest(pool, 10, 0);
    assert.ok(listed.total >= 1);
    assert.ok(
      listed.entries.some(
        (entry) => entry.userId === userId && entry.tier === 'black',
      ),
    );

    assert.equal(await deleteEchoPlusInterest(pool, userId), true);
    assert.equal(await getEchoPlusInterestForUser(pool, userId), null);

    console.log('echoPlusInterest.test: ok');
  } finally {
    await pool.query('DELETE FROM auth_echo_plus_interest WHERE user_id = $1', [
      userId,
    ]);
    await pool.query('DELETE FROM auth_users WHERE id = $1', [userId]);
    await pool.end();
  }
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
