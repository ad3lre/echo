import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  getEchoUserPublicProfileRow,
  getEchoUserPublicProfileRows,
} from '../../domain/echoStore/members/userTypingProfile';

async function insertAuthUserWithProfile(
  pool: pg.Pool,
  id: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `prof_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@prof.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (
      id, username, email, display_name, pfp, status, custom_status,
      bio, time_zone, banner_image, banner_color,
      banner_refraction_enabled, banner_blur_enabled, banner_blackout_enabled,
      banner_position_y, password_hash, updated_at
    )
    VALUES ($1, $2, $3, 'Display', 'https://cdn/pfp.webp', 'offline', '',
            'Bio text here', 'America/Chicago', 'https://cdn/banner.webp', '#1a1a2e',
            true, false, true, 33, $4, NOW())
    ON CONFLICT (id) DO UPDATE SET
      bio = EXCLUDED.bio,
      banner_image = EXCLUDED.banner_image,
      banner_color = EXCLUDED.banner_color,
      banner_refraction_enabled = EXCLUDED.banner_refraction_enabled,
      banner_blur_enabled = EXCLUDED.banner_blur_enabled,
      banner_blackout_enabled = EXCLUDED.banner_blackout_enabled,
      banner_position_y = EXCLUDED.banner_position_y,
      time_zone = EXCLUDED.time_zone
    `,
    [id, username, email, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.userPublicProfileDetail: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const userId = `prof_u_${Date.now().toString(36)}`;
  try {
    await ensureEchoTables(pool);
    await insertAuthUserWithProfile(pool, userId);

    const row = await getEchoUserPublicProfileRow(pool, userId);
    assert.ok(row);
    assert.equal(row!.bio, 'Bio text here');
    assert.equal(row!.bannerImage, 'https://cdn/banner.webp');
    assert.equal(row!.bannerColor, '#1a1a2e');
    assert.equal(row!.bannerRefractionEnabled, true);
    assert.equal(row!.bannerBlurEnabled, false);
    assert.equal(row!.bannerBlackoutEnabled, true);
    assert.equal(row!.bannerPositionY, 33);
    assert.equal(row!.timeZone, 'America/Chicago');

    assert.equal(await getEchoUserPublicProfileRow(pool, ''), null);
    assert.equal(
      await getEchoUserPublicProfileRow(pool, 'nonexistent_user_id'),
      null,
    );

    const batch = await getEchoUserPublicProfileRows(pool, [userId, 'missing']);
    assert.equal(batch.length, 1);
    assert.equal(batch[0]!.id, userId);
    assert.equal(batch[0]!.bio, 'Bio text here');

    console.log('echo.userPublicProfileDetail: ok');
  } finally {
    await pool.end();
  }
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
