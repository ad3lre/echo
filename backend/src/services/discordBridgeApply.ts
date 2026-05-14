import type { Pool } from 'pg';
import { ECHO_MSG_NOT_SERVER_MEMBER } from '../api/errors';
import {
  assertChannelImportedFromDiscord,
  deleteDiscordChannelBridge,
  getDiscordBridgeForEchoChannelInServer,
  normalizeDiscordWebhookUrl,
  upsertDiscordChannelBridge,
} from '../domain/discordBridgeRepo';
import {
  getEchoChannelCapabilitiesForUser,
  getEchoServerCapabilitiesForUser,
} from '../domain/echoStore';
import { isMemberOfServer } from '../domain/echoPermissions';
import { ensureDiscordOutboundWebhookUrl } from './discordBridgeWebhookEnsure';

export type DiscordBridgeApplyPayload = {
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  discordWebhookUrl?: unknown;
  discordGuildId?: unknown;
  discordChannelId?: unknown;
};

export type DiscordBridgeApplySuccess = {
  discordGuildId: string;
  discordChannelId: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  hasWebhook: boolean;
};

export type DiscordBridgeApplyFailure =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'INVALID_CHANNEL'; message: string }
  | { code: 'NOT_SERVER_MEMBER'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'INVALID_BODY'; message: string }
  | { code: 'DISCORD_WEBHOOK_FAILED'; message: string }
  | { code: 'CONFLICT'; message: string };

export type DiscordBridgeApplyResult =
  | { ok: true; result: DiscordBridgeApplySuccess }
  | { ok: false; error: DiscordBridgeApplyFailure };

/**
 * Same behavior as PUT `/servers/:serverId/channels/:channelId/discord-bridge`
 * (minus HTTP mapping). Used by the route and category bulk sync.
 */
export async function applyDiscordBridgePut(
  pool: Pool,
  serverId: string,
  channelId: string,
  userId: string,
  body: DiscordBridgeApplyPayload,
): Promise<DiscordBridgeApplyResult> {
  const okMem = await isMemberOfServer(pool, serverId, userId);
  if (!okMem) {
    return {
      ok: false,
      error: {
        code: 'NOT_SERVER_MEMBER',
        message: ECHO_MSG_NOT_SERVER_MEMBER,
      },
    };
  }

  const ch = await pool.query(
    `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  if (!ch.rows.length) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Channel not found.' },
    };
  }
  const type = String(ch.rows[0]?.type ?? '').toLowerCase();
  if (type !== 'text' && type !== 'forum') {
    return {
      ok: false,
      error: {
        code: 'INVALID_CHANNEL',
        message: 'Bridge is only available for text and forum channels.',
      },
    };
  }

  const [serverCaps, channelCaps] = await Promise.all([
    getEchoServerCapabilitiesForUser(pool, serverId, userId),
    getEchoChannelCapabilitiesForUser(pool, channelId, userId),
  ]);
  if (!serverCaps.canManageServer && !channelCaps.canManageChannel) {
    return {
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Manage server or manage channel required.',
      },
    };
  }

  const inboundEnabled = body.inboundEnabled === true;
  const outboundEnabled = body.outboundEnabled === true;

  const stateGuild = await pool.query(
    `SELECT discord_guild_id FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  const importGuildId =
    stateGuild.rows[0]?.discord_guild_id != null &&
    String(stateGuild.rows[0].discord_guild_id).trim()
      ? String(stateGuild.rows[0].discord_guild_id).trim()
      : null;
  const importChannelId = await assertChannelImportedFromDiscord(
    pool,
    serverId,
    channelId,
  );

  let discordGuildId: string | null =
    typeof body.discordGuildId === 'string' && body.discordGuildId.trim()
      ? body.discordGuildId.trim()
      : null;
  let discordChannelId: string | null =
    typeof body.discordChannelId === 'string' && body.discordChannelId.trim()
      ? body.discordChannelId.trim()
      : null;
  if (!discordGuildId || !discordChannelId) {
    const existing = await getDiscordBridgeForEchoChannelInServer(
      pool,
      serverId,
      channelId,
    );
    discordGuildId =
      discordGuildId ?? existing?.discordGuildId ?? importGuildId;
    discordChannelId =
      discordChannelId ?? existing?.discordChannelId ?? importChannelId;
  }

  let discordWebhookUrl: string | null = null;
  if (body.discordWebhookUrl === null) {
    discordWebhookUrl = null;
  } else if (typeof body.discordWebhookUrl === 'string') {
    const n = normalizeDiscordWebhookUrl(body.discordWebhookUrl);
    if (!body.discordWebhookUrl.trim()) {
      discordWebhookUrl = null;
    } else if (!n) {
      return {
        ok: false,
        error: {
          code: 'INVALID_BODY',
          message:
            'discordWebhookUrl must be a valid https://discord.com/api/webhooks/... URL',
        },
      };
    } else {
      discordWebhookUrl = n;
    }
  } else {
    const existing = await getDiscordBridgeForEchoChannelInServer(
      pool,
      serverId,
      channelId,
    );
    discordWebhookUrl = existing?.discordWebhookUrl ?? null;
  }

  if (
    (inboundEnabled || outboundEnabled) &&
    (!discordGuildId || !discordChannelId)
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_BODY',
        message:
          'discordGuildId and discordChannelId are required when enabling sync.',
      },
    };
  }

  if (outboundEnabled && !discordWebhookUrl && discordChannelId) {
    const ensured = await ensureDiscordOutboundWebhookUrl({
      discordChannelId,
      existingUrl: null,
    });
    if (!ensured.ok) {
      return {
        ok: false,
        error: {
          code: 'DISCORD_WEBHOOK_FAILED',
          message: ensured.message,
        },
      };
    }
    discordWebhookUrl = ensured.url;
  }

  if (!inboundEnabled && !outboundEnabled && !discordWebhookUrl) {
    await deleteDiscordChannelBridge(pool, channelId);
    return {
      ok: true,
      result: {
        discordGuildId: discordGuildId ?? '',
        discordChannelId: discordChannelId ?? '',
        inboundEnabled: false,
        outboundEnabled: false,
        hasWebhook: false,
      },
    };
  }

  const upsertResult = await upsertDiscordChannelBridge(pool, {
    channelId,
    serverId,
    discordGuildId,
    discordChannelId: discordChannelId ?? '',
    inboundEnabled,
    outboundEnabled,
    discordWebhookUrl,
  });
  if (!upsertResult.ok) {
    if (upsertResult.reason === 'missing_discord_pair') {
      return {
        ok: false,
        error: {
          code: 'INVALID_BODY',
          message:
            'discordGuildId and discordChannelId are required when enabling sync.',
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'CONFLICT',
        message:
          'This Discord channel is already synced to another Echo channel.',
      },
    };
  }

  return {
    ok: true,
    result: {
      discordGuildId: discordGuildId ?? '',
      discordChannelId: discordChannelId ?? '',
      inboundEnabled,
      outboundEnabled,
      hasWebhook: Boolean(discordWebhookUrl),
    },
  };
}
