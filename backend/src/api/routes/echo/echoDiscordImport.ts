import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import {
  getEchoServerCapabilitiesForUser,
  insertEchoAudit,
  isEchoServerOwner,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import {
  bindDiscordImportGuild,
  getDiscordImportState,
  runDiscordImportRefreshFromExport,
  runDiscordImportStep,
} from '../../../services/discordImport';
import { DiscordImportQuotaError } from '../../../services/discordImportQuota';
import { countEchoMessagesInChannel } from '../../../domain/echoMessagesDal';
import { runDiscordMessageImport } from '../../../services/discordMessageImport';
import { runDiscordImportPostSetup } from '../../../services/discordImportPostSetup';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

function importStepFromBody(
  raw: unknown,
): 'metadata' | 'roles' | 'members' | 'channels' | null {
  if (
    raw === 'metadata' ||
    raw === 'roles' ||
    raw === 'members' ||
    raw === 'channels'
  )
    return raw;
  return null;
}

export default async function echoDiscordImportRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/discord-import',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const state = await getDiscordImportState(pool, sid);
      if (!state) return reply.code(200).send({ state: null });
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        req.authUser!.id,
      );
      if (!caps.canManageServer) {
        return reply.code(200).send({
          state: {
            ...state,
            discordToEchoUserMap: {},
            userMapEntryCount: 0,
          },
        });
      }
      return reply.code(200).send({ state });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: { discordGuildId?: unknown };
  }>(
    '/servers/:serverId/discord-import/bind',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const actorId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, sid, actorId);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const [isOwner, caps] = await Promise.all([
        isEchoServerOwner(pool, sid, actorId),
        getEchoServerCapabilitiesForUser(pool, sid, actorId),
      ]);
      if (!isOwner && !caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server permission required',
        );
      }
      const raw = req.body?.discordGuildId;
      const discordGuildId = typeof raw === 'string' ? raw.trim() : '';
      if (!discordGuildId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'discordGuildId is required',
        );
      }
      try {
        await bindDiscordImportGuild(pool, sid, discordGuildId);
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bind failed';
        return sendError(reply, 400, 'DISCORD_IMPORT_BIND_FAILED', message);
      }
    },
  );

  /**
   * One-shot: optional bind + metadata + roles + channels (used after “Import from Discord” server create).
   * Roles/channels use `force` so the seeded default channel layout can be replaced without extra UI clicks.
   */
  fastify.post<{
    Params: { serverId: string };
    Body: { discordGuildId?: unknown };
  }>(
    '/servers/:serverId/discord-import/run-full',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const actorId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, sid, actorId);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const [isOwner, caps] = await Promise.all([
        isEchoServerOwner(pool, sid, actorId),
        getEchoServerCapabilitiesForUser(pool, sid, actorId),
      ]);
      if (!isOwner && !caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server permission required',
        );
      }
      const raw = req.body?.discordGuildId;
      const discordGuildId = typeof raw === 'string' ? raw.trim() : '';
      try {
        if (discordGuildId) {
          await bindDiscordImportGuild(pool, sid, discordGuildId);
        }
        fastify.log.info(
          { serverId: sid },
          'Discord import run-full: metadata',
        );
        await runDiscordImportStep(pool, sid, actorId, 'metadata');
        fastify.log.info({ serverId: sid }, 'Discord import run-full: roles');
        await runDiscordImportStep(pool, sid, actorId, 'roles', {
          force: true,
        });
        fastify.log.info({ serverId: sid }, 'Discord import run-full: members');
        await runDiscordImportStep(pool, sid, actorId, 'members');
        fastify.log.info(
          { serverId: sid },
          'Discord import run-full: channels',
        );
        const last = await runDiscordImportStep(
          pool,
          sid,
          actorId,
          'channels',
          { force: true },
        );
        await insertEchoAudit(
          pool,
          sid,
          actorId,
          'discord_import.run_full',
          'server',
          sid,
          {
            warnings: last.state.warnings.length,
            nextChannelId: last.nextChannelId ?? '',
          },
        );
        return reply.code(200).send({
          state: last.state,
          nextChannelId: last.nextChannelId ?? '',
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Discord import run-full failed');
        if (error instanceof DiscordImportQuotaError) {
          return sendError(
            reply,
            429,
            'DISCORD_IMPORT_DAILY_LIMIT',
            error.message,
          );
        }
        const message =
          error instanceof Error ? error.message : 'Discord import failed';
        if (process.env.ECHO_DEBUG_DISCORD_IMPORT === '1') {
          try {
            const state = await getDiscordImportState(pool, sid);
            req.log.error(
              {
                msg: 'echo.debug.discord_import.run_full_failed',
                requestId: req.id,
                actorId,
                serverId: sid,
                discordGuildId: discordGuildId || null,
                errorMessage: message,
                state: state
                  ? {
                      sourceDir: state.sourceDir,
                      previewError: state.previewError,
                      lastError: state.lastError,
                      nextStep: state.nextStep,
                      completedSteps: state.completedSteps,
                    }
                  : null,
              },
              'discord_import_run_full_failed',
            );
          } catch (err) {
            req.log.error(
              {
                msg: 'echo.debug.discord_import.run_full_failed_log_failed',
                requestId: req.id,
                actorId,
                serverId: sid,
                discordGuildId: discordGuildId || null,
                errorMessage: message,
                err,
              },
              'discord_import_run_full_failed_log_failed',
            );
          }
        }
        if (/permission/i.test(message)) {
          return sendError(reply, 403, 'FORBIDDEN', message);
        }
        return sendError(reply, 409, 'DISCORD_IMPORT_FAILED', message);
      }
    },
  );

  /**
   * After channels import: optionally import recent Discord messages into empty
   * text/forum channels first (throttled), then enable realtime bridge on all imported
   * text/forum channels and voice mirror on voice channels.
   */
  fastify.post<{
    Params: { serverId: string };
    Body: {
      syncAllChannels?: unknown;
      importRecentMessages?: unknown;
      messageLimit?: unknown;
    };
  }>(
    '/servers/:serverId/discord-import/post-setup',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const actorId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, sid, actorId);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const [isOwner, caps] = await Promise.all([
        isEchoServerOwner(pool, sid, actorId),
        getEchoServerCapabilitiesForUser(pool, sid, actorId),
      ]);
      if (!isOwner && !caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server permission required',
        );
      }

      const body = req.body ?? {};
      const syncAllChannels = body.syncAllChannels === true;
      const importRecentMessages = body.importRecentMessages === true;
      const rawLimit = body.messageLimit;
      const messageLimit =
        typeof rawLimit === 'number' && Number.isFinite(rawLimit)
          ? rawLimit
          : undefined;

      if (!syncAllChannels && !importRecentMessages) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Set syncAllChannels and/or importRecentMessages to true.',
        );
      }

      try {
        const result = await runDiscordImportPostSetup(pool, sid, actorId, {
          syncAllChannels,
          importRecentMessages,
          ...(messageLimit != null ? { messageLimit } : {}),
        });
        await insertEchoAudit(
          pool,
          sid,
          actorId,
          'discord_import.post_setup',
          'server',
          sid,
          {
            syncAllChannels,
            importRecentMessages,
            bridgesApplied: result.sync?.bridges.applied ?? 0,
            bridgesFailed: result.sync?.bridges.failed ?? 0,
            voiceEnabled: result.sync?.voice.enabled ?? 0,
            messagesImported: result.messages?.importedTotal ?? 0,
            messageFailures: result.messages?.failures.length ?? 0,
          },
        );
        return reply.code(200).send(result);
      } catch (error) {
        fastify.log.error({ err: error }, 'Discord import post-setup failed');
        const message =
          error instanceof Error ? error.message : 'Post-setup failed';
        if (/permission/i.test(message)) {
          return sendError(reply, 403, 'FORBIDDEN', message);
        }
        return sendError(
          reply,
          400,
          'DISCORD_IMPORT_POST_SETUP_FAILED',
          message,
        );
      }
    },
  );

  /**
   * Re-apply server branding + emoji pack and replace channels from the latest on-disk export
   * (after the bot writes a new bundle). Manage-server; destructive to channel messages.
   */
  fastify.post<{ Params: { serverId: string } }>(
    '/servers/:serverId/discord-import/refresh-from-export',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const actorId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, sid, actorId);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const [isOwner, caps] = await Promise.all([
        isEchoServerOwner(pool, sid, actorId),
        getEchoServerCapabilitiesForUser(pool, sid, actorId),
      ]);
      if (!isOwner && !caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server permission required',
        );
      }
      try {
        const result = await runDiscordImportRefreshFromExport(
          pool,
          sid,
          actorId,
        );
        await insertEchoAudit(
          pool,
          sid,
          actorId,
          'discord_import.refresh_from_export',
          'server',
          sid,
          {
            warnings: result.state.warnings.length,
            nextChannelId: result.nextChannelId ?? '',
          },
        );
        return reply.code(200).send(result);
      } catch (error) {
        fastify.log.error(
          { err: error },
          'Discord import refresh-from-export failed',
        );
        if (error instanceof DiscordImportQuotaError) {
          return sendError(
            reply,
            429,
            'DISCORD_IMPORT_DAILY_LIMIT',
            error.message,
          );
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Discord import refresh failed';
        if (/permission/i.test(message)) {
          return sendError(reply, 403, 'FORBIDDEN', message);
        }
        return sendError(reply, 409, 'DISCORD_IMPORT_FAILED', message);
      }
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string };
    Body: { limit?: number };
  }>(
    '/servers/:serverId/channels/:channelId/discord-import-messages',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const actorId = req.authUser!.id;

      // Verify membership and permission (manage server / owner-equivalent via caps)
      const okMem = await isMemberOfServer(pool, serverId, actorId);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const [isOwner, caps] = await Promise.all([
        isEchoServerOwner(pool, serverId, actorId),
        getEchoServerCapabilitiesForUser(pool, serverId, actorId),
      ]);
      if (!isOwner && !caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server permission required',
        );
      }

      try {
        const preCount = await countEchoMessagesInChannel(pool, channelId);
        req.log.info({
          msg: 'echo.debug.discord_import_messages.start',
          requestId: req.id,
          actorId,
          serverId,
          channelId,
          requestedLimit:
            typeof req.body?.limit === 'number' ? req.body.limit : null,
          channelMessageCountBefore: preCount,
        });
        const result = await runDiscordMessageImport(
          pool,
          serverId,
          channelId,
          actorId,
          {
            limit: req.body?.limit,
          },
        );

        await insertEchoAudit(
          pool,
          serverId,
          actorId,
          'discord_import.messages',
          'channel',
          channelId,
          {
            importedCount: result.importedCount,
          },
        );

        const postCount = await countEchoMessagesInChannel(pool, channelId);
        req.log.info({
          msg: 'echo.debug.discord_import_messages.success',
          requestId: req.id,
          actorId,
          serverId,
          channelId,
          importedCount: result.importedCount,
          channelMessageCountAfter: postCount,
        });

        return reply.code(200).send(result);
      } catch (err) {
        req.log.error(
          { err, serverId, channelId },
          'discord_message_import_failed',
        );
        const message =
          err instanceof Error ? err.message : 'Message import failed';
        return sendError(reply, 400, 'DISCORD_MESSAGE_IMPORT_FAILED', message);
      }
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: { step?: unknown; force?: unknown };
  }>(
    '/servers/:serverId/discord-import',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const actorId = req.authUser!.id;
      const okMem = await isMemberOfServer(pool, sid, actorId);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const [isOwner, caps] = await Promise.all([
        isEchoServerOwner(pool, sid, actorId),
        getEchoServerCapabilitiesForUser(pool, sid, actorId),
      ]);
      if (!isOwner && !caps.canManageServer) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Manage server permission required',
        );
      }
      const step = importStepFromBody(req.body?.step);
      if (!step)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'step must be metadata, roles, members, or channels',
        );
      try {
        const force = Boolean(
          req.body?.force === true || req.body?.force === 'true',
        );
        fastify.log.info(
          { serverId: sid, step, force },
          'Starting Discord import step',
        );
        const result = await runDiscordImportStep(
          pool,
          sid,
          req.authUser!.id,
          step,
          { force },
        );
        fastify.log.info(
          { serverId: sid, step, warnings: result.state.warnings.length },
          'Discord import step completed',
        );
        await insertEchoAudit(
          pool,
          sid,
          req.authUser!.id,
          `discord_import.${step}`,
          'server',
          sid,
          {
            warnings: result.state.warnings.length,
            nextChannelId: result.nextChannelId ?? '',
          },
        );
        return reply.code(200).send(result);
      } catch (error) {
        // Log full error server-side for easier debugging in dev
        fastify.log.error({ err: error }, 'Discord import failed');
        if (error instanceof DiscordImportQuotaError) {
          return sendError(
            reply,
            429,
            'DISCORD_IMPORT_DAILY_LIMIT',
            error.message,
          );
        }
        const message =
          error instanceof Error ? error.message : 'Discord import failed';
        if (/permission/i.test(message)) {
          return sendError(reply, 403, 'FORBIDDEN', message);
        }
        return sendError(reply, 409, 'DISCORD_IMPORT_FAILED', message);
      }
    },
  );
}
