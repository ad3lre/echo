import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  ECHO_TEXT_CHANNELS_CATEGORY_NAME,
  ECHO_VOICE_CHANNELS_CATEGORY_NAME,
  isDiscordMirrorOnlyEveryonePartial,
  repairEchoVoiceChannelMigrationDamage,
} from '../db/repairEchoVoiceChannelMigration';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `vcmig_${id.replace(/-/g, '').slice(0, 20)}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `${username}@vcmig.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Voice migration repair test', passwordHash],
  );
}

async function runUnit(): Promise<void> {
  assert.equal(isDiscordMirrorOnlyEveryonePartial({ CONNECT: false }), true);
  assert.equal(
    isDiscordMirrorOnlyEveryonePartial({ connect: false }),
    true,
    'camelCase connect deny is mirror signature',
  );
  assert.equal(
    isDiscordMirrorOnlyEveryonePartial({ CONNECT: true, SPEAK: false }),
    false,
    'stage defaults must not match mirror signature',
  );
  assert.equal(
    isDiscordMirrorOnlyEveryonePartial({ CONNECT: false, VIEW_CHANNEL: false }),
    false,
    'multi-key partial is intentional, not mirror-only',
  );
}

async function runIntegration(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.voiceChannelMigrationRepair integration: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `vcmig_owner_${Date.now().toString(36)}`;
  const serverId = nextEchoSnowflakeId();
  const textCatId = nextEchoSnowflakeId();
  const voiceChId = nextEchoSnowflakeId();
  const textChId = nextEchoSnowflakeId();

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);

    await pool.query(
      `INSERT INTO echo_servers (id, name, icon_url, owner_id) VALUES ($1, $2, '', $3)`,
      [serverId, 'vc-migration-repair', ownerId],
    );
    await pool.query(
      `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, 0)`,
      [textCatId, serverId, ECHO_TEXT_CHANNELS_CATEGORY_NAME],
    );
    await pool.query(
      `
      INSERT INTO echo_channels (id, server_id, name, type, category_id, position, discord_voice_mirror_only)
      VALUES
        ($1, $2, 'general', 'text', $3, 0, false),
        ($4, $2, 'voice', 'voice', $3, 1, false)
      `,
      [textChId, serverId, textCatId, voiceChId],
    );
    await pool.query(
      `
      INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
      VALUES ($1, $2, $3, 'everyone', NULL, $4::jsonb)
      `,
      [
        nextEchoSnowflakeId(),
        serverId,
        voiceChId,
        JSON.stringify({ CONNECT: false }),
      ],
    );
    await pool.query(
      `UPDATE echo_channels SET discord_voice_mirror_only = true WHERE id = $1`,
      [voiceChId],
    );

    await repairEchoVoiceChannelMigrationDamage(pool);

    const voiceRow = await pool.query(
      `
      SELECT ch.category_id, cat.name AS category_name, ch.discord_voice_mirror_only
      FROM echo_channels ch
      LEFT JOIN echo_categories cat ON cat.id = ch.category_id
      WHERE ch.id = $1
      `,
      [voiceChId],
    );
    assert.equal(
      String(voiceRow.rows[0]?.category_name ?? ''),
      ECHO_VOICE_CHANNELS_CATEGORY_NAME,
    );
    assert.equal(voiceRow.rows[0]?.discord_voice_mirror_only, false);

    const ow = await pool.query(
      `SELECT 1 FROM echo_channel_permission_overwrite_rows WHERE channel_id = $1`,
      [voiceChId],
    );
    assert.equal(ow.rows.length, 0);

    await repairEchoVoiceChannelMigrationDamage(pool);
    const voiceRowAgain = await pool.query(
      `
      SELECT cat.name AS category_name
      FROM echo_channels ch
      LEFT JOIN echo_categories cat ON cat.id = ch.category_id
      WHERE ch.id = $1
      `,
      [voiceChId],
    );
    assert.equal(
      String(voiceRowAgain.rows[0]?.category_name ?? ''),
      ECHO_VOICE_CHANNELS_CATEGORY_NAME,
      'second repair pass is idempotent',
    );
  } finally {
    await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    await pool.end();
  }
}

async function run(): Promise<void> {
  await runUnit();
  await runIntegration();
  console.log('echo.voiceChannelMigrationRepair: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
