import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { ensureAuthTables } from './authTables';
import { ensureEchoTables } from './echoTables';
import { repairEchoVoiceChannelMigrationDamage } from './repairEchoVoiceChannelMigration';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';

test(
  'schema restarts preserve placement and never grant badges by username',
  {
    skip: !process.env.PG_TEST_URL,
  },
  async () => {
    const pool = new pg.Pool({ connectionString: process.env.PG_TEST_URL });
    const userId = `review_${Date.now()}`;
    const serverId = nextEchoSnowflakeId();
    const categoryId = nextEchoSnowflakeId();
    const channelId = nextEchoSnowflakeId();
    try {
      await ensureAuthTables(pool);
      await ensureEchoTables(pool);
      await pool.query(
        `INSERT INTO auth_users (id, username, display_name, password_hash)
      VALUES ($1, 'danny', 'Ledger test', 'unused')`,
        [userId],
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO echo_servers (id, name, owner_id)
        VALUES ($1, 'Ledger test', $2)`,
          [serverId, userId],
        );
        await client.query(
          `INSERT INTO echo_server_members (server_id, user_id)
        VALUES ($1, $2)`,
          [serverId, userId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await pool.query(
        `INSERT INTO echo_categories (id, server_id, name, position)
      VALUES ($1, $2, 'Text Channels', 0)`,
        [categoryId, serverId],
      );
      await pool.query(
        `INSERT INTO echo_channels (id, server_id, name, type, category_id)
      VALUES ($1, $2, 'Intentional voice', 'voice', $3)`,
        [channelId, serverId, categoryId],
      );
      for (const username of [
        'danny',
        'dannas29',
        'bb',
        'lesbian',
        'm4',
        'blawh',
      ]) {
        await pool.query('UPDATE auth_users SET username = $1 WHERE id = $2', [
          username,
          userId,
        ]);
        await ensureAuthTables(pool);
        const user = await pool.query(
          'SELECT awarded_badges FROM auth_users WHERE id = $1',
          [userId],
        );
        assert.deepEqual(user.rows[0].awarded_badges, [], username);
      }
      await ensureEchoTables(pool);
      const stats = await repairEchoVoiceChannelMigrationDamage(pool);
      assert.equal(stats.voiceChannelsRecategorized, 0);
      const channel = await pool.query(
        'SELECT category_id FROM echo_channels WHERE id = $1',
        [channelId],
      );
      assert.equal(channel.rows[0].category_id, categoryId);
      await pool.query(
        "UPDATE auth_users SET awarded_badges = ARRAY['developer']::text[] WHERE id = $1",
        [userId],
      );
      await ensureAuthTables(pool);
      const awarded = await pool.query(
        'SELECT awarded_badges FROM auth_users WHERE id = $1',
        [userId],
      );
      assert.deepEqual(awarded.rows[0].awarded_badges, ['developer']);
    } finally {
      await pool.query('DELETE FROM echo_servers WHERE id = $1', [serverId]);
      await pool.query('DELETE FROM auth_users WHERE id = $1', [userId]);
      await pool.end();
    }
  },
);
