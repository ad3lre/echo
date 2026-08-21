import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { sendError } from '../errors';
import { requireAuth } from '../../auth/middleware';
import { getAuthStore } from '../../auth/store';
import { config } from '../../config';
import { ensureAppSchema } from '../../db/ensureAppSchema';
import { getPgPool } from '../../db/pg';
import {
  discordBotIsMemberOfGuild,
  fetchDiscordUserGuildsAll,
} from '../../services/integrations/discordApiClient';
import {
  buildDiscordBotInstallUrl,
  discordGuildIconUrl,
  discordUserCanImportFromGuild,
} from '../../domain/discord/discordImportableGuilds';
import {
  parseDiscordNormalizedJson,
  type DiscordNormalizedV1,
} from '../../domain/discord/discordNormalized';
import { getDiscordUserAccessTokenForApi } from '../../domain/discord/discordUserAccessToken';
import { getDiscordLinkByUserId } from '../../domain/discord/discordUserLinkRepo';
import {
  listDiscordBotExportPendingForUser,
  markDiscordBotExportReadyForGuild,
  upsertDiscordBotExportPending,
} from '../../domain/discord/discordBotExportPendingRepo';
import {
  DiscordImportAuthorizationError,
  requireDiscordImportableGuildForUser,
} from '../../services/discordImport/discordImportAuthorization';
import { isDiscordExportBundleReady } from '../../services/discordImport/discordExportBundleReady';

function parseDiscordGuildIdQuery(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{10,25}$/.test(s)) return null;
  return s;
}

function publicDiscordProfile(n: DiscordNormalizedV1) {
  return {
    discordUserId: n.discordUserId,
    username: n.username,
    globalName: n.globalName,
    bio: n.bio,
    avatarUrl: n.avatarUrl,
    bannerUrl: n.bannerUrl,
    emailPresent: n.emailPresent,
    premiumType: n.premiumType,
    guildCount: n.guildCount,
    connectionsCount: n.connectionsCount,
  };
}

function sendDiscordImportAuthorizationError(
  fastify: FastifyInstance,
  reply: FastifyReply,
  err: unknown,
  logLabel: string,
) {
  if (err instanceof DiscordImportAuthorizationError) {
    if (err.statusCode >= 500) {
      fastify.log.warn(
        (err as Error & { cause?: unknown }).cause ?? err,
        logLabel,
      );
    }
    return sendError(reply, err.statusCode, err.errorCode, err.publicMessage);
  }
  fastify.log.warn(err, logLabel);
  return sendError(
    reply,
    502,
    'DISCORD_UNAVAILABLE',
    'Could not verify your Discord access.',
  );
}

export default async function meDiscordRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get(
    '/me/discord',
    { preHandler: [requireAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Discord linking requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      const row = await getDiscordLinkByUserId(pool, req.authUser.id);
      if (!row) {
        return reply.code(200).send({ linked: false });
      }
      const norm =
        parseDiscordNormalizedJson(row.discordNormalized) ??
        row.discordNormalized;
      return reply.code(200).send({
        linked: true,
        mergeKind: row.mergeKind,
        profile: publicDiscordProfile(norm),
      });
    },
  );

  fastify.get(
    '/me/discord/importable-guilds',
    { preHandler: [requireAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Discord requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      const linkRow = await getDiscordLinkByUserId(pool, req.authUser.id);
      if (!linkRow) {
        return reply
          .code(200)
          .send({ linked: false as const, guilds: [] as const });
      }

      let accessToken: string;
      try {
        accessToken = await getDiscordUserAccessTokenForApi(
          pool,
          req.authUser.id,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'NOT_LINKED') {
          return reply
            .code(200)
            .send({ linked: false as const, guilds: [] as const });
        }
        if (
          msg === 'TOKEN_EXPIRED' ||
          msg.startsWith('discord_refresh_failed')
        ) {
          return reply.code(200).send({
            linked: true as const,
            tokenExpired: true as const,
            guilds: [] as const,
          });
        }
        fastify.log.warn(e, 'discord_importable_guilds_token');
        return sendError(
          reply,
          502,
          'DISCORD_UNAVAILABLE',
          'Could not use your Discord link. Try reconnecting in Settings.',
        );
      }

      try {
        const all = await fetchDiscordUserGuildsAll(accessToken);
        const manageable = all.filter((g) => discordUserCanImportFromGuild(g));
        const guilds = manageable.map((g) => {
          const botInviteUrl = buildDiscordBotInstallUrl(g.id) ?? '';
          return {
            id: g.id,
            name: g.name,
            iconUrl: discordGuildIconUrl(g.id, g.icon),
            botInviteUrl,
          };
        });
        return reply.code(200).send({
          linked: true as const,
          tokenExpired: false as const,
          guilds,
        });
      } catch (e) {
        const status =
          e && typeof e === 'object' && 'status' in e
            ? Number((e as { status?: number }).status)
            : NaN;
        if (status === 403 || status === 401) {
          return reply.code(200).send({
            linked: true as const,
            missingGuildsScope: true as const,
            guilds: [] as const,
          });
        }
        fastify.log.warn(e, 'discord_importable_guilds_fetch');
        return sendError(
          reply,
          502,
          'DISCORD_UNAVAILABLE',
          'Could not load your Discord servers.',
        );
      }
    },
  );

  fastify.get<{ Querystring: { discordGuildId?: string } }>(
    '/me/discord/bot-in-guild',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const gid = parseDiscordGuildIdQuery(req.query.discordGuildId);
      if (!gid) {
        return sendError(
          reply,
          400,
          'INVALID_QUERY',
          'discordGuildId is required',
        );
      }

      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Discord requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      let authorizedGuild: Awaited<
        ReturnType<typeof requireDiscordImportableGuildForUser>
      >;
      try {
        authorizedGuild = await requireDiscordImportableGuildForUser(
          pool,
          req.authUser.id,
          gid,
        );
      } catch (e) {
        return sendDiscordImportAuthorizationError(
          fastify,
          reply,
          e,
          'discord_bot_in_guild_authorize',
        );
      }

      const botTok = config.discordBotToken;
      if (!botTok) {
        return reply
          .code(200)
          .send({ botInGuild: false, checkSkipped: true as const });
      }

      const botInGuild = await discordBotIsMemberOfGuild(
        botTok,
        authorizedGuild.id,
      );
      return reply.code(200).send({ botInGuild, checkSkipped: false as const });
    },
  );

  fastify.get(
    '/me/discord/bot-export-pending',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Discord requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      try {
        await ensureAppSchema(pool);
        let pending = await listDiscordBotExportPendingForUser(
          pool,
          req.authUser.id,
        );
        const unresolvedGuildIds = [
          ...new Set(
            pending
              .filter((row) => !row.ready)
              .map((row) => row.discordGuildId.trim())
              .filter(Boolean),
          ),
        ];
        let autoMarkedAny = false;
        for (const gid of unresolvedGuildIds) {
          if (
            await isDiscordExportBundleReady(
              config.discordExportCollectionsRoot,
              gid,
            )
          ) {
            await markDiscordBotExportReadyForGuild(pool, gid);
            autoMarkedAny = true;
          }
        }
        if (autoMarkedAny) {
          pending = await listDiscordBotExportPendingForUser(
            pool,
            req.authUser.id,
          );
        }
        return reply.code(200).send({ pending });
      } catch (e) {
        fastify.log.error(e, 'discord_bot_export_pending_list');
        return sendError(
          reply,
          503,
          'DATABASE_ERROR',
          'Database temporarily unavailable',
        );
      }
    },
  );

  fastify.post<{ Body: { discordGuildId?: unknown; guildName?: unknown } }>(
    '/me/discord/bot-export-pending',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Discord requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      const rawG = req.body?.discordGuildId;
      const discordGuildId = typeof rawG === 'string' ? rawG.trim() : '';
      if (!discordGuildId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'discordGuildId is required',
        );
      }
      let authorizedGuild: Awaited<
        ReturnType<typeof requireDiscordImportableGuildForUser>
      >;
      try {
        authorizedGuild = await requireDiscordImportableGuildForUser(
          pool,
          req.authUser.id,
          discordGuildId,
        );
      } catch (e) {
        return sendDiscordImportAuthorizationError(
          fastify,
          reply,
          e,
          'discord_bot_export_pending_authorize',
        );
      }
      try {
        await ensureAppSchema(pool);
        await upsertDiscordBotExportPending(
          pool,
          req.authUser.id,
          authorizedGuild.id,
          authorizedGuild.name,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid guild id';
        if (msg.includes('Invalid Discord server id')) {
          return sendError(reply, 400, 'INVALID_GUILD_ID', msg);
        }
        fastify.log.error(e, 'discord_bot_export_pending_upsert');
        return sendError(
          reply,
          503,
          'DATABASE_ERROR',
          'Database temporarily unavailable',
        );
      }
      return reply.code(204).send();
    },
  );

  fastify.delete(
    '/me/discord',
    { preHandler: [requireAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      return sendError(
        reply,
        403,
        'DISCORD_UNLINK_DISABLED',
        'Unlinking your Discord account is not supported.',
      );
    },
  );
}
