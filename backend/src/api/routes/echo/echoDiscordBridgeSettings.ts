import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
} from 'fastify';
import type { Pool } from 'pg';
import { requireAuth } from '../../../auth/middleware';
import { getAuthStore } from '../../../auth/store';
import { config } from '../../../config';
import {
  assertChannelImportedFromDiscord,
  getDiscordBridgeForEchoChannelInServer,
} from '../../../domain/discordBridgeRepo';
import type { DiscordBridgeApplyResult } from '../../../services/discordBridgeApply';
import {
  applyDiscordBridgeClear,
  applyDiscordBridgePut,
} from '../../../services/discordBridgeApply';
import {
  buildDiscordBotInstallUrl,
  discordGuildIconUrl,
  discordUserCanImportFromGuild,
} from '../../../domain/discordImportableGuilds';
import { getDiscordUserAccessTokenForApi } from '../../../domain/discordUserAccessToken';
import {
  getEchoChannelCapabilitiesForUser,
  getEchoServerCapabilitiesForUser,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import {
  discordBotFetchGuildChannels,
  discordBotFetchGuildName,
  discordBotIsMemberOfGuild,
  fetchDiscordBotGuildIdsAll,
  fetchDiscordUserGuildsAll,
} from '../../../services/integrations/discordApiClient';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const DISCORD_BRIDGEABLE_CHANNEL_TYPES = new Set([0, 5, 15]);

function sendDiscordBridgeApplyResponse(
  reply: FastifyReply,
  r: DiscordBridgeApplyResult,
) {
  if (r.ok) {
    return reply.code(200).send(r.result);
  }
  const e = r.error;
  switch (e.code) {
    case 'NOT_FOUND':
      return sendError(reply, 404, 'NOT_FOUND', e.message);
    case 'INVALID_CHANNEL':
      return sendError(reply, 400, 'INVALID_CHANNEL', e.message);
    case 'NOT_SERVER_MEMBER':
      return sendError(reply, 403, 'FORBIDDEN', e.message, 'NOT_SERVER_MEMBER');
    case 'FORBIDDEN':
      return sendError(reply, 403, 'FORBIDDEN', e.message);
    case 'INVALID_BODY':
      return sendError(reply, 400, 'INVALID_BODY', e.message);
    case 'DISCORD_WEBHOOK_FAILED':
      return sendError(reply, 502, 'DISCORD_WEBHOOK_FAILED', e.message);
    case 'CONFLICT':
      return sendError(reply, 409, 'CONFLICT', e.message);
    default:
      return sendError(reply, 500, 'INTERNAL', 'Unexpected bridge error.');
  }
}

async function userCanPickDiscordGuildForBridge(
  pool: Pool,
  serverId: string,
  accessToken: string,
  discordGuildId: string,
): Promise<boolean> {
  const st = await pool.query(
    `SELECT discord_guild_id FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  const imp =
    st.rows[0]?.discord_guild_id != null &&
    String(st.rows[0].discord_guild_id).trim()
      ? String(st.rows[0].discord_guild_id).trim()
      : '';
  if (imp && imp === discordGuildId.trim()) return true;
  const all = await fetchDiscordUserGuildsAll(accessToken);
  const manageable = all.filter((g) => discordUserCanImportFromGuild(g));
  return manageable.some((g) => g.id === discordGuildId.trim());
}

export default async function echoDiscordBridgeSettingsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/discord-bridge',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, serverId, userId);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const ch = await pool.query(
        `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
        [channelId, serverId],
      );
      if (!ch.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found.');
      }
      const row = await getDiscordBridgeForEchoChannelInServer(
        pool,
        serverId,
        channelId,
      );
      const [serverCaps, channelCaps] = await Promise.all([
        getEchoServerCapabilitiesForUser(pool, serverId, userId),
        getEchoChannelCapabilitiesForUser(pool, channelId, userId),
      ]);
      if (!serverCaps.canManageServer && !channelCaps.canManageChannel) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server or manage channel required.',
        );
      }

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
      const discordGuildId = row?.discordGuildId?.trim() || importGuildId || '';
      const discordChannelId =
        row?.discordChannelId?.trim() || importChannelId || '';

      return reply.code(200).send({
        discordGuildId,
        discordChannelId,
        inboundEnabled: row?.inboundEnabled ?? false,
        outboundEnabled: row?.outboundEnabled ?? false,
        hasWebhook: Boolean(row?.discordWebhookUrl?.trim()),
        hasBridge: Boolean(row),
      });
    },
  );

  fastify.get<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/discord-bridge/discord-guilds',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, serverId, userId);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const ch = await pool.query(
        `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
        [channelId, serverId],
      );
      if (!ch.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found.');
      }
      const [serverCaps, channelCaps] = await Promise.all([
        getEchoServerCapabilitiesForUser(pool, serverId, userId),
        getEchoChannelCapabilitiesForUser(pool, channelId, userId),
      ]);
      if (!serverCaps.canManageServer && !channelCaps.canManageChannel) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server or manage channel required.',
        );
      }

      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return reply.code(200).send({
          linked: false as const,
          tokenExpired: false as const,
          missingGuildsScope: false as const,
          botConfigured: Boolean(config.discordBotToken?.trim()),
          guilds: [] as const,
        });
      }

      const botTok = config.discordBotToken?.trim() ?? '';

      try {
        const accessToken = await getDiscordUserAccessTokenForApi(pool, userId);
        const [all, botGuildIds, stateGuild] = await Promise.all([
          fetchDiscordUserGuildsAll(accessToken),
          botTok
            ? fetchDiscordBotGuildIdsAll(botTok)
            : Promise.resolve(new Set<string>()),
          pool.query(
            `SELECT discord_guild_id FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
            [serverId],
          ),
        ]);
        const manageable = all.filter((g) => discordUserCanImportFromGuild(g));
        const out: {
          id: string;
          name: string;
          iconUrl: string | null;
          botInGuild: boolean;
          botInviteUrl: string;
        }[] = manageable.map((g) => ({
          id: g.id,
          name: g.name,
          iconUrl: discordGuildIconUrl(g.id, g.icon),
          botInGuild: botTok ? botGuildIds.has(g.id) : false,
          botInviteUrl: buildDiscordBotInstallUrl(g.id) ?? '',
        }));

        const importG =
          stateGuild.rows[0]?.discord_guild_id != null &&
          String(stateGuild.rows[0].discord_guild_id).trim()
            ? String(stateGuild.rows[0].discord_guild_id).trim()
            : '';
        if (
          importG &&
          botTok &&
          botGuildIds.has(importG) &&
          !out.some((x) => x.id === importG)
        ) {
          const name = await discordBotFetchGuildName(botTok, importG);
          out.push({
            id: importG,
            name: name ?? 'Discord server',
            iconUrl: null,
            botInGuild: true,
            botInviteUrl: buildDiscordBotInstallUrl(importG) ?? '',
          });
        }

        return reply.code(200).send({
          linked: true as const,
          tokenExpired: false as const,
          missingGuildsScope: false as const,
          botConfigured: Boolean(botTok),
          guilds: out,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'NOT_LINKED') {
          return reply.code(200).send({
            linked: false as const,
            tokenExpired: false as const,
            missingGuildsScope: false as const,
            botConfigured: Boolean(botTok),
            guilds: [] as const,
          });
        }
        if (
          msg === 'TOKEN_EXPIRED' ||
          msg.startsWith('discord_refresh_failed')
        ) {
          return reply.code(200).send({
            linked: true as const,
            tokenExpired: true as const,
            missingGuildsScope: false as const,
            botConfigured: Boolean(botTok),
            guilds: [] as const,
          });
        }
        const status =
          e && typeof e === 'object' && 'status' in e
            ? Number((e as { status?: number }).status)
            : NaN;
        if (status === 403 || status === 401) {
          return reply.code(200).send({
            linked: true as const,
            tokenExpired: false as const,
            missingGuildsScope: true as const,
            botConfigured: Boolean(botTok),
            guilds: [] as const,
          });
        }
        req.log.warn(e, 'discord_bridge.discovery.guilds');
        return sendError(
          reply,
          502,
          'DISCORD_UNAVAILABLE',
          'Could not load Discord servers.',
        );
      }
    },
  );

  fastify.get<{
    Params: { serverId: string; channelId: string };
    Querystring: { discordGuildId?: string };
  }>(
    '/servers/:serverId/channels/:channelId/discord-bridge/discord-channels',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const discordGuildIdRaw =
        typeof req.query.discordGuildId === 'string'
          ? req.query.discordGuildId.trim()
          : '';
      if (!/^\d{10,25}$/.test(discordGuildIdRaw)) {
        return sendError(
          reply,
          400,
          'INVALID_QUERY',
          'discordGuildId query parameter is required.',
        );
      }

      const okMem = await isMemberOfServer(pool, serverId, userId);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const ch = await pool.query(
        `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
        [channelId, serverId],
      );
      if (!ch.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found.');
      }
      const [serverCaps, channelCaps] = await Promise.all([
        getEchoServerCapabilitiesForUser(pool, serverId, userId),
        getEchoChannelCapabilitiesForUser(pool, channelId, userId),
      ]);
      if (!serverCaps.canManageServer && !channelCaps.canManageChannel) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server or manage channel required.',
        );
      }

      const botTok = config.discordBotToken?.trim();
      if (!botTok) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Discord bot token is not configured on this Echo deployment.',
        );
      }

      try {
        const accessToken = await getDiscordUserAccessTokenForApi(pool, userId);
        const okGuild = await userCanPickDiscordGuildForBridge(
          pool,
          serverId,
          accessToken,
          discordGuildIdRaw,
        );
        if (!okGuild) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot configure sync for that Discord server.',
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'NOT_LINKED' || msg === 'TOKEN_EXPIRED') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Link your Discord account in Echo settings first.',
          );
        }
        throw e;
      }

      const botInGuild = await discordBotIsMemberOfGuild(
        botTok,
        discordGuildIdRaw,
      );
      if (!botInGuild) {
        return sendError(
          reply,
          400,
          'BOT_NOT_IN_GUILD',
          'Invite the Echo bot to this Discord server before selecting a channel.',
        );
      }

      const raw = await discordBotFetchGuildChannels(botTok, discordGuildIdRaw);
      const categoryNames = new Map<string, string>();
      for (const c of raw) {
        if (c.type === 4 && c.name) categoryNames.set(c.id, c.name);
      }
      const bridgeable = raw.filter((c) =>
        DISCORD_BRIDGEABLE_CHANNEL_TYPES.has(c.type),
      );
      bridgeable.sort((a, b) => {
        const pa = String(a.parent_id ?? '');
        const pb = String(b.parent_id ?? '');
        if (pa !== pb) return pa.localeCompare(pb);
        return (a.position ?? 0) - (b.position ?? 0);
      });
      const channels = bridgeable.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        categoryName: c.parent_id
          ? (categoryNames.get(c.parent_id) ?? null)
          : null,
      }));

      return reply.code(200).send({ channels });
    },
  );

  fastify.put<{
    Params: { serverId: string; channelId: string };
    Body: {
      inboundEnabled?: unknown;
      outboundEnabled?: unknown;
      discordWebhookUrl?: unknown;
      discordGuildId?: unknown;
      discordChannelId?: unknown;
    };
  }>(
    '/servers/:serverId/channels/:channelId/discord-bridge',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const body = req.body ?? {};
      const r = await applyDiscordBridgePut(
        pool,
        serverId,
        channelId,
        userId,
        {
          inboundEnabled: body.inboundEnabled === true,
          outboundEnabled: body.outboundEnabled === true,
          discordWebhookUrl: body.discordWebhookUrl,
          discordGuildId: body.discordGuildId,
          discordChannelId: body.discordChannelId,
        },
        { io: fastify.io, log: req.log },
      );
      return sendDiscordBridgeApplyResponse(reply, r);
    },
  );

  fastify.delete<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/discord-bridge',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const r = await applyDiscordBridgeClear(
        pool,
        serverId,
        channelId,
        userId,
      );
      return sendDiscordBridgeApplyResponse(reply, r);
    },
  );

  fastify.post<{
    Params: { serverId: string; categoryId: string };
    Body: { inboundEnabled?: unknown; outboundEnabled?: unknown };
  }>(
    '/servers/:serverId/categories/:categoryId/discord-bridge/bulk-apply',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const userId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, serverId, userId);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const cat = await pool.query(
        `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2 LIMIT 1`,
        [categoryId, serverId],
      );
      if (!cat.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found.');
      }

      const body = req.body ?? {};
      const inboundEnabled = body.inboundEnabled === true;
      const outboundEnabled = body.outboundEnabled === true;

      const chRows = await pool.query<{ id: string }>(
        `
        SELECT id FROM echo_channels
        WHERE server_id = $1 AND category_id = $2
          AND LOWER(type) IN ('text', 'forum')
        ORDER BY position ASC, name ASC
        `,
        [serverId, categoryId],
      );

      let applied = 0;
      let failed = 0;
      let skipped = 0;
      const failures: { channelId: string; message: string }[] = [];

      for (const row of chRows.rows) {
        const channelId = String(row.id);
        const r = await applyDiscordBridgePut(
          pool,
          serverId,
          channelId,
          userId,
          {
            inboundEnabled,
            outboundEnabled,
          },
          { io: fastify.io, log: req.log },
        );
        if (r.ok) {
          applied += 1;
          continue;
        }
        if (r.error.code === 'FORBIDDEN') {
          skipped += 1;
          continue;
        }
        failed += 1;
        failures.push({
          channelId,
          message: r.error.message,
        });
      }

      return reply.code(200).send({ applied, failed, skipped, failures });
    },
  );

  fastify.post<{
    Params: { serverId: string; categoryId: string };
  }>(
    '/servers/:serverId/categories/:categoryId/discord-bridge/bulk-clear',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const userId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, serverId, userId);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const cat = await pool.query(
        `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2 LIMIT 1`,
        [categoryId, serverId],
      );
      if (!cat.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found.');
      }

      const chRows = await pool.query<{ id: string }>(
        `
        SELECT id FROM echo_channels
        WHERE server_id = $1 AND category_id = $2
          AND LOWER(type) IN ('text', 'forum')
        ORDER BY position ASC, name ASC
        `,
        [serverId, categoryId],
      );

      let applied = 0;
      let failed = 0;
      let skipped = 0;
      const failures: { channelId: string; message: string }[] = [];

      for (const row of chRows.rows) {
        const channelId = String(row.id);
        const r = await applyDiscordBridgeClear(
          pool,
          serverId,
          channelId,
          userId,
        );
        if (r.ok) {
          applied += 1;
          continue;
        }
        if (r.error.code === 'FORBIDDEN') {
          skipped += 1;
          continue;
        }
        failed += 1;
        failures.push({
          channelId,
          message: r.error.message,
        });
      }

      return reply.code(200).send({ applied, failed, skipped, failures });
    },
  );
}
