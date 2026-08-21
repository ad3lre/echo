import type { Pool } from 'pg';

export type DiscordActivity = {
  name: string;
  type: number;
  details?: string;
  state?: string;
};

export type DiscordPresenceRow = {
  discordUserId: string;
  discordUsername: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: DiscordActivity[];
  isOnline: boolean;
  snapshotAt: Date;
  discordGuildId: string;
};

/**
 * Upsert presence snapshot for a Discord user.
 */
export async function upsertDiscordPresence(
  pool: Pool,
  input: DiscordPresenceRow,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_discord_presence (
      discord_user_id, discord_username, status, activities, is_online, snapshot_at, discord_guild_id
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    ON CONFLICT (discord_user_id) DO UPDATE SET
      discord_username = EXCLUDED.discord_username,
      status = EXCLUDED.status,
      activities = EXCLUDED.activities,
      is_online = EXCLUDED.is_online,
      snapshot_at = EXCLUDED.snapshot_at,
      discord_guild_id = EXCLUDED.discord_guild_id
    `,
    [
      input.discordUserId,
      input.discordUsername,
      input.status,
      JSON.stringify(input.activities),
      input.isOnline,
      input.snapshotAt,
      input.discordGuildId,
    ],
  );
}

/**
 * Get presence for a single Discord user.
 */
export async function getDiscordPresence(
  pool: Pool,
  discordUserId: string,
): Promise<DiscordPresenceRow | null> {
  const res = await pool.query(
    `
    SELECT discord_user_id, discord_username, status, activities, is_online, snapshot_at, discord_guild_id
    FROM echo_discord_presence
    WHERE discord_user_id = $1
    LIMIT 1
    `,
    [discordUserId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return rowToPresence(r);
}

/**
 * Get presence for multiple Discord users.
 */
export async function getDiscordPresences(
  pool: Pool,
  discordUserIds: string[],
): Promise<Map<string, DiscordPresenceRow>> {
  if (discordUserIds.length === 0) return new Map();
  const res = await pool.query(
    `
    SELECT discord_user_id, discord_username, status, activities, is_online, snapshot_at, discord_guild_id
    FROM echo_discord_presence
    WHERE discord_user_id = ANY($1::text[])
    `,
    [discordUserIds],
  );
  const map = new Map<string, DiscordPresenceRow>();
  for (const r of res.rows) {
    map.set(String(r.discord_user_id), rowToPresence(r));
  }
  return map;
}

/**
 * Get all currently online Discord users.
 */
export async function getOnlineDiscordPresences(
  pool: Pool,
  staleAfterMinutes = 5,
): Promise<DiscordPresenceRow[]> {
  const res = await pool.query(
    `
    SELECT discord_user_id, discord_username, status, activities, is_online, snapshot_at, discord_guild_id
    FROM echo_discord_presence
    WHERE is_online = true
      AND snapshot_at > NOW() - INTERVAL '${staleAfterMinutes} minutes'
    `,
  );
  return res.rows.map(rowToPresence);
}

/**
 * Mark stale presence records as offline.
 */
export async function markStaleDiscordPresenceOffline(
  pool: Pool,
  staleAfterMinutes: number,
): Promise<string[]> {
  const res = await pool.query(
    `
    UPDATE echo_discord_presence
    SET is_online = false,
        status = 'offline'
    WHERE is_online = true
      AND snapshot_at < NOW() - INTERVAL '${staleAfterMinutes} minutes'
    RETURNING discord_user_id
    `,
  );
  return res.rows.map((r) => String(r.discord_user_id));
}

/**
 * Get Discord presence by linked Echo user IDs.
 * Returns a map of Echo userId -> presence (only for linked, online users).
 */
export async function getDiscordPresenceByEchoUserIds(
  pool: Pool,
  echoUserIds: string[],
): Promise<Map<string, DiscordPresenceRow>> {
  if (echoUserIds.length === 0) return new Map();
  const res = await pool.query(
    `
    SELECT l.user_id, p.discord_user_id, p.discord_username, p.status, p.activities, p.is_online, p.snapshot_at, p.discord_guild_id
    FROM auth_discord_user_links l
    JOIN echo_discord_presence p ON l.discord_user_id = p.discord_user_id
    WHERE l.user_id = ANY($1::text[])
      AND p.is_online = true
      AND p.snapshot_at > NOW() - INTERVAL '5 minutes'
    `,
    [echoUserIds],
  );
  const map = new Map<string, DiscordPresenceRow>();
  for (const r of res.rows) {
    map.set(String(r.user_id), rowToPresence(r));
  }
  return map;
}

function rowToPresence(r: Record<string, unknown>): DiscordPresenceRow {
  return {
    discordUserId: String(r.discord_user_id),
    discordUsername: String(r.discord_username),
    status: String(r.status) as DiscordPresenceRow['status'],
    activities: (r.activities as DiscordActivity[]) ?? [],
    isOnline: Boolean(r.is_online),
    snapshotAt: new Date(String(r.snapshot_at)),
    discordGuildId: String(r.discord_guild_id ?? ''),
  };
}
