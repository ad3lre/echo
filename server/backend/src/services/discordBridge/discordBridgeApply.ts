import type { FastifyBaseLogger } from 'fastify';
import type { Pool } from 'pg';
import type { Server } from 'socket.io';
import { ECHO_MSG_NOT_SERVER_MEMBER } from '../../api/errors';
import {
  assertChannelImportedFromDiscord,
  deleteDiscordChannelBridge,
  getDiscordBridgeForEchoChannelInServer,
  normalizeDiscordWebhookUrl,
  upsertDiscordChannelBridge,
} from '../../domain/discord/discordBridgeRepo';
import {
  getEchoChannelCapabilitiesForUser,
  getEchoServerCapabilitiesForUser,
} from '../../domain/echoStore';
import { isMemberOfServer } from '../../domain/permissions/echoPermissions';
import { ensureDiscordOutboundWebhookUrl } from './discordBridgeWebhookEnsure';
import {
  postDiscordBridgeSyncNotice,
  shouldPostDiscordBridgeSyncNotice,
} from './discordBridgeSyncNotice';

export type DiscordBridgeApplyContext = {
  io?: Server;
  log?: FastifyBaseLogger;
};

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
  /** True when a row exists in `echo_discord_channel_bridges`. */
  hasBridge: boolean;
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

export type DiscordBridgeClearContext = DiscordBridgeApplyContext;

async function resolveDiscordBridgeChannelAccess(
  pool: Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: DiscordBridgeApplyFailure }> {
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

  return { ok: true };
}

async function clearedDiscordBridgeStateForChannel(
  pool: Pool,
  serverId: string,
  channelId: string,
): Promise<DiscordBridgeApplySuccess> {
  const stateGuild = await pool.query(
    `SELECT discord_guild_id FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  const importGuildId =
    stateGuild.rows[0]?.discord_guild_id != null &&
    String(stateGuild.rows[0].discord_guild_id).trim()
      ? String(stateGuild.rows[0].discord_guild_id).trim()
      : '';
  const importChannelId = await assertChannelImportedFromDiscord(
    pool,
    serverId,
    channelId,
  );
  return {
    discordGuildId: importGuildId,
    discordChannelId: importChannelId ?? '',
    inboundEnabled: false,
    outboundEnabled: false,
    hasWebhook: false,
    hasBridge: false,
  };
}

/**
 * Remove the Discord bridge row for a channel (sync off, webhook cleared).
 * Same behavior as DELETE `/servers/:serverId/channels/:channelId/discord-bridge`.
 */
export async function applyDiscordBridgeClear(
  pool: Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<DiscordBridgeApplyResult> {
  const access = await resolveDiscordBridgeChannelAccess(
    pool,
    serverId,
    channelId,
    userId,
  );
  if (!access.ok) {
    return access;
  }

  await deleteDiscordChannelBridge(pool, channelId);
  return {
    ok: true,
    result: await clearedDiscordBridgeStateForChannel(
      pool,
      serverId,
      channelId,
    ),
  };
}

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
  ctx?: DiscordBridgeApplyContext,
): Promise<DiscordBridgeApplyResult> {
  const access = await resolveDiscordBridgeChannelAccess(
    pool,
    serverId,
    channelId,
    userId,
  );
  if (!access.ok) {
    return access;
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

  const bridgeBeforeUpsert = await getDiscordBridgeForEchoChannelInServer(
    pool,
    serverId,
    channelId,
  );
  const prevInbound = bridgeBeforeUpsert?.inboundEnabled === true;
  const prevOutbound = bridgeBeforeUpsert?.outboundEnabled === true;

  if (!inboundEnabled && !outboundEnabled && !discordWebhookUrl) {
    await deleteDiscordChannelBridge(pool, channelId);
    return {
      ok: true,
      result: {
        ...(await clearedDiscordBridgeStateForChannel(
          pool,
          serverId,
          channelId,
        )),
        discordGuildId: discordGuildId ?? '',
        discordChannelId: discordChannelId ?? '',
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

  const result = {
    discordGuildId: discordGuildId ?? '',
    discordChannelId: discordChannelId ?? '',
    inboundEnabled,
    outboundEnabled,
    hasWebhook: Boolean(discordWebhookUrl),
    hasBridge: true,
  };

  if (
    ctx?.log &&
    shouldPostDiscordBridgeSyncNotice(
      prevInbound,
      prevOutbound,
      inboundEnabled,
      outboundEnabled,
    )
  ) {
    const dChan = (discordChannelId ?? '').trim();
    if (dChan) {
      void postDiscordBridgeSyncNotice(pool, ctx.io, ctx.log, {
        echoChannelId: channelId,
        discordChannelId: dChan,
        inboundEnabled,
        outboundEnabled,
        discordWebhookUrl,
      }).catch((e) => {
        ctx.log!.warn(
          { err: e, msg: 'discord_bridge.sync_notice_failed', channelId },
          'Discord bridge sync notice failed',
        );
      });
    }
  }

  return { ok: true, result };
}
