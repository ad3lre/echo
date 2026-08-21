import type pg from 'pg';

/**
 * DDL for Echo bot applications.
 * Bots authenticate via `Authorization: Bot <token>` against the Discord-compat API.
 */
export async function ensureBotTables(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_bot_applications (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_bot_guild_installs (
      bot_id TEXT NOT NULL REFERENCES echo_bot_applications(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      installed_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, guild_id)
    );
  `);
}
