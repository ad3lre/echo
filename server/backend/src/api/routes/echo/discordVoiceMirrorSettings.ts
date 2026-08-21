import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import {
  getDiscordVoiceMirrorCategory,
  getDiscordVoiceMirrorVoiceChannel,
  listFullRosterForServer,
  upsertDiscordVoiceMirrorCategory,
  upsertDiscordVoiceMirrorVoiceChannel,
  deleteDiscordVoiceMirrorVoiceChannelRow,
  applyMirrorVoiceDenyConnect,
} from '../../../domain/discord/discordVoiceMirrorRepo';
import {
  getEchoChannelCapabilitiesForUser,
  getEchoServerCapabilitiesForUser,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/permissions/echoPermissions';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

export default async function echoDiscordVoiceMirrorSettingsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/discord-voice-mirror/roster',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const userId = getAuthUser(req).id;
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
      const serverCaps = await getEchoServerCapabilitiesForUser(
        pool,
        serverId,
        userId,
      );
      if (!serverCaps.canManageServer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Manage server required.');
      }
      const channels = await listFullRosterForServer(pool, serverId);
      return reply.code(200).send({ channels });
    },
  );

  fastify.get<{ Params: { serverId: string; categoryId: string } }>(
    '/servers/:serverId/categories/:categoryId/discord-voice-mirror',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const userId = getAuthUser(req).id;
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
        `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
        [categoryId, serverId],
      );
      if (!cat.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found.');
      }
      const [serverCaps] = await Promise.all([
        getEchoServerCapabilitiesForUser(pool, serverId, userId),
      ]);
      if (!serverCaps.canManageServer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Manage server required.');
      }
      const row = await getDiscordVoiceMirrorCategory(
        pool,
        serverId,
        categoryId,
      );
      return reply.code(200).send({
        enabled: row?.enabled ?? false,
        discordCategoryId: row?.discordCategoryId ?? '',
      });
    },
  );

  fastify.put<{
    Params: { serverId: string; categoryId: string };
    Body: {
      enabled?: unknown;
      discordCategoryId?: unknown;
    };
  }>(
    '/servers/:serverId/categories/:categoryId/discord-voice-mirror',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const userId = getAuthUser(req).id;
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
        `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
        [categoryId, serverId],
      );
      if (!cat.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found.');
      }
      const serverCaps = await getEchoServerCapabilitiesForUser(
        pool,
        serverId,
        userId,
      );
      if (!serverCaps.canManageServer) {
        return sendError(reply, 403, 'FORBIDDEN', 'Manage server required.');
      }
      const imp = await pool.query(
        `SELECT 1 FROM echo_discord_import_states WHERE server_id = $1 AND channels_imported_at IS NOT NULL LIMIT 1`,
        [serverId],
      );
      if (!imp.rows.length) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Discord import required for voice mirror.',
        );
      }
      const enabled = req.body?.enabled === true;
      const prevRow = await getDiscordVoiceMirrorCategory(
        pool,
        serverId,
        categoryId,
      );
      let discordCategoryId: string | null = prevRow?.discordCategoryId ?? null;
      const bodyObj = req.body && typeof req.body === 'object' ? req.body : {};
      if ('discordCategoryId' in bodyObj) {
        const rawDc = (bodyObj as { discordCategoryId?: unknown })
          .discordCategoryId;
        if (typeof rawDc === 'string') {
          discordCategoryId = rawDc.trim() || null;
        }
      }

      await upsertDiscordVoiceMirrorCategory(pool, {
        serverId,
        categoryId,
        enabled,
        discordCategoryId,
      });

      return reply.code(200).send({
        enabled,
        discordCategoryId: discordCategoryId ?? '',
      });
    },
  );

  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/discord-voice-mirror',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = getAuthUser(req).id;
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
        `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2`,
        [channelId, serverId],
      );
      if (!ch.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found.');
      }
      if (String(ch.rows[0]?.type ?? '').toLowerCase() !== 'voice') {
        return sendError(
          reply,
          400,
          'INVALID_CHANNEL',
          'Voice mirror settings apply to voice channels only.',
        );
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
      const row = await getDiscordVoiceMirrorVoiceChannel(
        pool,
        serverId,
        channelId,
      );
      return reply.code(200).send({
        enabled: row?.enabled ?? false,
      });
    },
  );

  fastify.put<{
    Params: { serverId: string; channelId: string };
    Body: { enabled?: unknown };
  }>(
    '/servers/:serverId/channels/:channelId/discord-voice-mirror',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = getAuthUser(req).id;
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
        `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2`,
        [channelId, serverId],
      );
      if (!ch.rows.length) {
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found.');
      }
      if (String(ch.rows[0]?.type ?? '').toLowerCase() !== 'voice') {
        return sendError(
          reply,
          400,
          'INVALID_CHANNEL',
          'Voice mirror settings apply to voice channels only.',
        );
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
      const imp = await pool.query(
        `SELECT 1 FROM echo_discord_import_states WHERE server_id = $1 AND channels_imported_at IS NOT NULL LIMIT 1`,
        [serverId],
      );
      if (!imp.rows.length) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Discord import required for voice mirror.',
        );
      }

      const enabled = req.body?.enabled === true;
      if (enabled) {
        await upsertDiscordVoiceMirrorVoiceChannel(pool, {
          serverId,
          channelId,
          enabled: true,
        });
        await pool.query(
          `UPDATE echo_channels SET discord_voice_mirror_only = true WHERE id = $1 AND server_id = $2`,
          [channelId, serverId],
        );
        await applyMirrorVoiceDenyConnect(pool, serverId, channelId);
      } else {
        await deleteDiscordVoiceMirrorVoiceChannelRow(pool, channelId);
        await pool.query(
          `UPDATE echo_channels SET discord_voice_mirror_only = false WHERE id = $1 AND server_id = $2`,
          [channelId, serverId],
        );
      }

      return reply.code(200).send({ enabled });
    },
  );
}
