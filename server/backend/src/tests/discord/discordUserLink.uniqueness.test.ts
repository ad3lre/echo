import assert from 'node:assert/strict';
import pg from 'pg';
import { ensureAuthTables } from '../../db/authTables';
import {
  getUserIdByDiscordUserId,
  upsertDiscordUserLink,
} from '../../domain/discord/discordUserLinkRepo';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const username = `dlink_${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, display_name, pfp, status, password_hash)
    VALUES ($1, $2, 'Discord link test', '', 'online', NULL)
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stdout.write(
      'Skipping discordUserLink.uniqueness.test.ts: PG_TEST_URL / DATABASE_URL not set\n',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const userA = `du_a_${Date.now().toString(36)}`;
  const userB = `du_b_${Date.now().toString(36)}`;
  const discordUserId = '123456789012345678';

  try {
    await pool.query('SELECT 1');
    await ensureAuthTables(pool);
    await insertAuthUser(pool, userA);
    await insertAuthUser(pool, userB);

    await upsertDiscordUserLink(pool, {
      userId: userA,
      discordUserId,
      accessTokenCipher: 'cipher-a',
      refreshTokenCipher: null,
      tokenExpiresAt: null,
      scope: 'identify',
      discordNormalized: {
        v: 1,
        discordUserId,
        username: 'user-a',
        globalName: null,
        bio: null,
        avatarHash: null,
        avatarUrl: null,
        bannerHash: null,
        bannerUrl: null,
        emailPresent: false,
        premiumType: null,
        guildCount: null,
        connectionsCount: null,
      },
      discordRawCache: null,
      mergeKind: 'partial',
    });

    await assert.rejects(
      upsertDiscordUserLink(pool, {
        userId: userB,
        discordUserId,
        accessTokenCipher: 'cipher-b',
        refreshTokenCipher: null,
        tokenExpiresAt: null,
        scope: 'identify',
        discordNormalized: {
          v: 1,
          discordUserId,
          username: 'user-b',
          globalName: null,
          bio: null,
          avatarHash: null,
          avatarUrl: null,
          bannerHash: null,
          bannerUrl: null,
          emailPresent: false,
          premiumType: null,
          guildCount: null,
          connectionsCount: null,
        },
        discordRawCache: null,
        mergeKind: 'partial',
      }),
      (error: unknown) => {
        const code = (error as { code?: string } | null)?.code;
        return code === '23505';
      },
      'expected unique violation when linking same Discord account twice',
    );

    const linkedUser = await getUserIdByDiscordUserId(pool, discordUserId);
    assert.equal(linkedUser, userA);
  } finally {
    await pool
      .query(`DELETE FROM auth_discord_user_links WHERE user_id IN ($1, $2)`, [
        userA,
        userB,
      ])
      .catch(() => {});
    await pool
      .query(`DELETE FROM auth_users WHERE id IN ($1, $2)`, [userA, userB])
      .catch(() => {});
    await pool.end();
  }
}

run()
  .then(() => {
    process.stdout.write('discordUserLink.uniqueness.test.ts passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `discordUserLink.uniqueness.test.ts failed: ${String(error)}\n`,
    );
    process.exit(1);
  });
