import type pg from 'pg';

export type DiscordBotExportPendingRow = {
  echoUserId: string;
  discordGuildId: string;
  guildName: string;
  readyAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeGuildId(raw: string): string {
  const s = raw.trim();
  if (!/^\d{10,25}$/.test(s)) throw new Error('Invalid Discord server id.');
  return s;
}

export async function upsertDiscordBotExportPending(
  pool: pg.Pool,
  echoUserId: string,
  discordGuildId: string,
  guildName: string,
): Promise<void> {
  const gid = normalizeGuildId(discordGuildId);
  const name = guildName.trim().slice(0, 200);
  await pool.query(
    `INSERT INTO echo_discord_bot_export_pending (echo_user_id, discord_guild_id, guild_name, ready_at, created_at, updated_at)
     VALUES ($1, $2, $3, NULL, NOW(), NOW())
     ON CONFLICT (echo_user_id, discord_guild_id) DO UPDATE SET
       guild_name = EXCLUDED.guild_name,
       ready_at = NULL,
       updated_at = NOW()`,
    [echoUserId, gid, name],
  );
}

export async function listDiscordBotExportPendingForUser(
  pool: pg.Pool,
  echoUserId: string,
): Promise<
  {
    discordGuildId: string;
    guildName: string;
    ready: boolean;
    updatedAt: string;
  }[]
> {
  const r = await pool.query<{
    discord_guild_id: string;
    guild_name: string;
    ready_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT discord_guild_id, guild_name, ready_at, updated_at
     FROM echo_discord_bot_export_pending
     WHERE echo_user_id = $1
     ORDER BY updated_at DESC`,
    [echoUserId],
  );
  return r.rows.map((row) => {
    const u = row.updated_at;
    const updatedAt =
      u instanceof Date
        ? u.toISOString()
        : typeof u === 'string'
          ? u
          : new Date().toISOString();
    return {
      discordGuildId: row.discord_guild_id,
      guildName: row.guild_name || 'Discord server',
      ready: row.ready_at != null,
      updatedAt,
    };
  });
}

/** Distinct Discord guild ids that have at least one user waiting for export (ready_at IS NULL). */
export async function listDiscordGuildIdsWithPendingBotExport(
  pool: pg.Pool,
): Promise<string[]> {
  const r = await pool.query<{ discord_guild_id: string }>(
    `SELECT DISTINCT discord_guild_id
     FROM echo_discord_bot_export_pending
     WHERE ready_at IS NULL`,
  );
  return r.rows.map((row) => row.discord_guild_id);
}

/** Marks pending rows ready for this guild; returns affected Echo user ids for notifications. */
export async function markDiscordBotExportReadyForGuild(
  pool: pg.Pool,
  discordGuildId: string,
): Promise<
  { echoUserId: string; discordGuildId: string; guildName: string }[]
> {
  const gid = normalizeGuildId(discordGuildId);
  const r = await pool.query<{
    echo_user_id: string;
    discord_guild_id: string;
    guild_name: string;
  }>(
    `UPDATE echo_discord_bot_export_pending
     SET ready_at = NOW(), updated_at = NOW()
     WHERE discord_guild_id = $1 AND ready_at IS NULL
     RETURNING echo_user_id, discord_guild_id, guild_name`,
    [gid],
  );
  return r.rows.map((row) => ({
    echoUserId: row.echo_user_id,
    discordGuildId: row.discord_guild_id,
    guildName: row.guild_name || 'Discord server',
  }));
}
