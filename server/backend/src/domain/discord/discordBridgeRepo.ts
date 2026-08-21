import type pg from 'pg';
import { getDiscordImportState } from '../../services/discordImport/discordImport';

export type EchoDiscordChannelBridgeRow = {
  channelId: string;
  serverId: string;
  discordGuildId: string | null;
  discordChannelId: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  discordWebhookUrl: string | null;
};

type PgQueryable = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>>;
};

export type UpsertDiscordChannelBridgeResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing_discord_pair';
    }
  | {
      ok: false;
      reason: 'discord_channel_conflict';
      channelId: string;
    };

function mapDiscordBridgeRow(
  row: Record<string, unknown>,
): EchoDiscordChannelBridgeRow {
  return {
    channelId: String(row.channel_id),
    serverId: String(row.server_id),
    discordGuildId:
      row.discord_guild_id != null && String(row.discord_guild_id).trim()
        ? String(row.discord_guild_id).trim()
        : null,
    discordChannelId: String(row.discord_channel_id),
    inboundEnabled: row.inbound_enabled === true,
    outboundEnabled: row.outbound_enabled === true,
    discordWebhookUrl:
      row.discord_webhook_url != null && String(row.discord_webhook_url).trim()
        ? String(row.discord_webhook_url).trim()
        : null,
  };
}

export async function getDiscordBridgeForEchoChannel(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoDiscordChannelBridgeRow | null> {
  const r = await pool.query(
    `
    SELECT channel_id, server_id, discord_guild_id, discord_channel_id, inbound_enabled, outbound_enabled,
           discord_webhook_url
    FROM echo_discord_channel_bridges
    WHERE channel_id = $1
    LIMIT 1
    `,
    [channelId],
  );
  if (!r.rows.length) return null;
  return mapDiscordBridgeRow(r.rows[0] as Record<string, unknown>);
}

export async function getDiscordBridgeForEchoChannelInServer(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<EchoDiscordChannelBridgeRow | null> {
  const r = await pool.query(
    `
    SELECT channel_id, server_id, discord_guild_id, discord_channel_id, inbound_enabled, outbound_enabled,
           discord_webhook_url
    FROM echo_discord_channel_bridges
    WHERE channel_id = $1 AND server_id = $2
    LIMIT 1
    `,
    [channelId, serverId],
  );
  if (!r.rows.length) return null;
  return mapDiscordBridgeRow(r.rows[0] as Record<string, unknown>);
}

function normalizedActiveDiscordPair(input: {
  discordGuildId: string | null;
  discordChannelId: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
}): { discordGuildId: string; discordChannelId: string } | null {
  if (!input.inboundEnabled && !input.outboundEnabled) return null;
  const discordGuildId = input.discordGuildId?.trim() ?? '';
  const discordChannelId = input.discordChannelId.trim();
  if (!discordGuildId || !discordChannelId) return null;
  return { discordGuildId, discordChannelId };
}

async function findActiveDiscordBridgeConflict(
  db: PgQueryable,
  input: {
    channelId: string;
    discordGuildId: string | null;
    discordChannelId: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
  },
): Promise<UpsertDiscordChannelBridgeResult | null> {
  const pair = normalizedActiveDiscordPair(input);
  if (!pair) return null;
  const clash = await db.query<{ channel_id: string }>(
    `
    SELECT channel_id
    FROM echo_discord_channel_bridges
    WHERE NULLIF(BTRIM(discord_guild_id), '') = $1
      AND NULLIF(BTRIM(discord_channel_id), '') = $2
      AND channel_id <> $3
      AND (inbound_enabled = true OR outbound_enabled = true)
    LIMIT 1
    `,
    [pair.discordGuildId, pair.discordChannelId, input.channelId],
  );
  if (!clash.rows.length) return null;
  return {
    ok: false,
    reason: 'discord_channel_conflict',
    channelId: String(clash.rows[0]!.channel_id),
  };
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

async function executeDiscordChannelBridgeUpsert(
  db: PgQueryable,
  input: {
    channelId: string;
    serverId: string;
    discordGuildId: string | null;
    discordChannelId: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    discordWebhookUrl: string | null;
  },
): Promise<void> {
  const discordGuildId = input.discordGuildId?.trim() || null;
  const discordChannelId = input.discordChannelId.trim();
  const discordWebhookUrl = input.discordWebhookUrl?.trim() || null;
  await db.query(
    `
    INSERT INTO echo_discord_channel_bridges (
      channel_id, server_id, discord_guild_id, discord_channel_id, inbound_enabled, outbound_enabled,
      discord_webhook_url, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (channel_id) DO UPDATE SET
      server_id = EXCLUDED.server_id,
      discord_guild_id = EXCLUDED.discord_guild_id,
      discord_channel_id = EXCLUDED.discord_channel_id,
      inbound_enabled = EXCLUDED.inbound_enabled,
      outbound_enabled = EXCLUDED.outbound_enabled,
      discord_webhook_url = EXCLUDED.discord_webhook_url,
      updated_at = NOW()
    `,
    [
      input.channelId,
      input.serverId,
      discordGuildId,
      discordChannelId,
      input.inboundEnabled,
      input.outboundEnabled,
      discordWebhookUrl,
    ],
  );
}

export async function upsertDiscordChannelBridge(
  pool: pg.Pool,
  input: {
    channelId: string;
    serverId: string;
    discordGuildId: string | null;
    discordChannelId: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    discordWebhookUrl: string | null;
  },
): Promise<UpsertDiscordChannelBridgeResult> {
  const pair = normalizedActiveDiscordPair(input);
  if ((input.inboundEnabled || input.outboundEnabled) && !pair) {
    return { ok: false, reason: 'missing_discord_pair' };
  }
  if (!pair) {
    await executeDiscordChannelBridgeUpsert(pool, input);
    return { ok: true };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [pair.discordGuildId, pair.discordChannelId],
    );
    const conflict = await findActiveDiscordBridgeConflict(client, input);
    if (conflict) {
      await client.query('ROLLBACK');
      return conflict;
    }
    try {
      await executeDiscordChannelBridgeUpsert(client, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          reason: 'discord_channel_conflict',
          channelId: '',
        };
      }
      throw err;
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteDiscordChannelBridge(
  pool: pg.Pool,
  channelId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_discord_channel_bridges WHERE channel_id = $1`,
    [channelId],
  );
}

/** Rows for bot allowlist: channels where inbound sync is enabled. */
export async function listDiscordInboundBridgeRows(pool: pg.Pool): Promise<
  {
    discordGuildId: string;
    discordChannelId: string;
  }[]
> {
  const r = await pool.query(
    `
    SELECT b.discord_channel_id, COALESCE(b.discord_guild_id, s.discord_guild_id) AS discord_guild_id
    FROM echo_discord_channel_bridges b
    LEFT JOIN echo_discord_import_states s ON s.server_id = b.server_id
    WHERE b.inbound_enabled = true
      AND COALESCE(b.discord_guild_id, s.discord_guild_id) IS NOT NULL
      AND TRIM(COALESCE(b.discord_guild_id, s.discord_guild_id)) <> ''
    `,
  );
  const out: { discordGuildId: string; discordChannelId: string }[] = [];
  for (const row of r.rows) {
    const rec = row as {
      discord_guild_id?: unknown;
      discord_channel_id?: unknown;
    };
    const dg = String(rec.discord_guild_id ?? '').trim();
    const dc = String(rec.discord_channel_id ?? '').trim();
    if (dg && dc) out.push({ discordGuildId: dg, discordChannelId: dc });
  }
  return out;
}

export async function tryInsertBridgeIngested(
  pool: pg.Pool,
  discordChannelId: string,
  discordMessageId: string,
): Promise<boolean> {
  const ins = await pool.query(
    `
    INSERT INTO echo_discord_bridge_ingested (discord_channel_id, discord_message_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    RETURNING discord_message_id
    `,
    [discordChannelId, discordMessageId],
  );
  return ins.rows.length > 0;
}

/**
 * Resolve Echo server + channel from Discord ids using import `channel_id_map`.
 */
export async function resolveEchoChannelForDiscordBridge(
  pool: pg.Pool,
  discordGuildId: string,
  discordChannelId: string,
): Promise<{ serverId: string; echoChannelId: string } | null> {
  const bridge = await pool.query(
    `
    SELECT b.channel_id, b.server_id
    FROM echo_discord_channel_bridges b
    LEFT JOIN echo_discord_import_states s ON s.server_id = b.server_id
    WHERE b.discord_channel_id = $2
      AND b.inbound_enabled = true
      AND COALESCE(
        NULLIF(BTRIM(b.discord_guild_id), ''),
        NULLIF(BTRIM(s.discord_guild_id), '')
      ) = $1
    LIMIT 1
    `,
    [discordGuildId.trim(), discordChannelId.trim()],
  );
  if (bridge.rows.length) {
    const row = bridge.rows[0] as { channel_id?: unknown; server_id?: unknown };
    const echoChannelId = String(row.channel_id ?? '').trim();
    const serverId = String(row.server_id ?? '').trim();
    if (echoChannelId && serverId) return { serverId, echoChannelId };
  }

  const r = await pool.query(
    `
    SELECT server_id, channel_id_map, discord_guild_id
    FROM echo_discord_import_states
    WHERE discord_guild_id = $1
    LIMIT 1
    `,
    [discordGuildId.trim()],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as {
    server_id: unknown;
    channel_id_map: unknown;
  };
  const map = row.channel_id_map;
  if (!map || typeof map !== 'object') return null;
  const echoId = (map as Record<string, string>)[discordChannelId.trim()];
  if (!echoId || typeof echoId !== 'string' || !echoId.trim()) return null;
  return {
    serverId: String(row.server_id ?? '').trim(),
    echoChannelId: echoId.trim(),
  };
}

export async function assertChannelImportedFromDiscord(
  pool: pg.Pool,
  serverId: string,
  echoChannelId: string,
): Promise<string | null> {
  const state = await getDiscordImportState(pool, serverId);
  if (!state?.channelsImported) return null;
  for (const [dId, eId] of Object.entries(state.channelIdMap)) {
    if (eId === echoChannelId) return dId;
  }
  return null;
}

export function normalizeDiscordWebhookUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'discord.com' && host !== 'canary.discord.com') return null;
  if (!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname)) return null;
  return u.toString();
}

/** Extract webhook snowflake id from URL for loop detection. */
export function discordWebhookIdFromUrl(webhookUrl: string): string | null {
  const m = /\/webhooks\/(\d+)\//.exec(webhookUrl);
  return m ? m[1]! : null;
}
