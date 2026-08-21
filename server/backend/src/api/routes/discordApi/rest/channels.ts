import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import {
  requireBotAuth,
  getBotInstalledGuildIds,
  getBotInstallerUserId,
} from '../botAuth';
import { serializeChannel } from '../serializers';
import { getEchoStore } from '../../../../domain/echoStore/bootstrap';
import { isEchoServerOwner } from '../../../../domain/echoStore';
import { getEffectiveChannelPermissions } from '../../../../domain/echoStore/roles/permissions';

function discordError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ code: 0, message });
}

async function getChannelAndVerifyBotAccess(
  botId: string,
  channelId: string,
  permission: import('../../../../domain/permissions/echoPermissionPrimitives').EchoPermission,
  reply: FastifyReply,
): Promise<{
  guildId: string;
  installerId: string;
  row: Record<string, unknown>;
} | null> {
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) {
    discordError(reply, 503, '503: Service Unavailable');
    return null;
  }

  const r = await pool.query(
    `SELECT id, name, type, server_id, position, category_id, nsfw, bitrate_bps, user_limit
     FROM echo_channels WHERE id = $1`,
    [channelId],
  );
  if (r.rows.length === 0) {
    discordError(reply, 404, '404: Unknown Channel');
    return null;
  }
  const row = r.rows[0] as Record<string, unknown>;
  const guildId = String(row.server_id ?? '');

  const installedGuilds = await getBotInstalledGuildIds(botId);
  if (!installedGuilds.includes(guildId)) {
    discordError(reply, 403, '403: Missing Access');
    return null;
  }

  const installerId = await getBotInstallerUserId(botId, guildId);
  if (!installerId) {
    discordError(reply, 403, '403: Missing Access (No Installer)');
    return null;
  }

  const isOwner = await isEchoServerOwner(pool, guildId, installerId);
  if (!isOwner) {
    const perms = await getEffectiveChannelPermissions(
      pool,
      guildId,
      installerId,
      channelId,
    );
    if (!perms.has(permission)) {
      discordError(reply, 403, `403: Missing Permissions (${permission})`);
      return null;
    }
  }

  return { guildId, installerId, row };
}

export default async function discordChannelsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /** GET /channels/:channelId */
  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const channelId = (req.params as { channelId: string }).channelId.trim();
      const result = await getChannelAndVerifyBotAccess(
        req.botApp!.id,
        channelId,
        'VIEW_CHANNEL',
        reply,
      );
      if (!result) return;

      const { guildId, row } = result;
      return reply.code(200).send(
        serializeChannel(
          {
            id: String(row.id),
            name: String(row.name),
            type: String(row.type),
            position: Number(row.position ?? 0),
            categoryId:
              typeof row.category_id === 'string' && row.category_id.trim()
                ? row.category_id.trim()
                : undefined,
            nsfw: Boolean(row.nsfw),
            bitrateBps:
              row.bitrate_bps != null ? Number(row.bitrate_bps) : null,
            userLimit:
              row.user_limit != null ? Number(row.user_limit) : undefined,
          },
          guildId,
        ),
      );
    },
  );

  /** PATCH /channels/:channelId */
  fastify.patch<{
    Params: { channelId: string };
    Body: { name?: string; topic?: string; nsfw?: boolean; position?: number };
  }>(
    '/channels/:channelId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const channelId = (req.params as { channelId: string }).channelId.trim();
      const result = await getChannelAndVerifyBotAccess(
        req.botApp!.id,
        channelId,
        'MANAGE_CHANNELS',
        reply,
      );
      if (!result) return;

      const { guildId, row } = result;
      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const body = req.body as {
        name?: string;
        topic?: string;
        nsfw?: boolean;
        position?: number;
      };

      const setClauses: string[] = [];
      const params: unknown[] = [channelId];

      if (typeof body.name === 'string' && body.name.trim()) {
        params.push(body.name.trim().slice(0, 100));
        setClauses.push(`name = $${params.length}`);
      }
      if (typeof body.nsfw === 'boolean') {
        params.push(body.nsfw);
        setClauses.push(`nsfw = $${params.length}`);
      }

      if (setClauses.length > 0) {
        await pool.query(
          `UPDATE echo_channels SET ${setClauses.join(', ')} WHERE id = $1`,
          params,
        );
      }

      const updatedRow = await pool.query(
        `SELECT id, name, type, server_id, position, category_id, nsfw, bitrate_bps, user_limit
         FROM echo_channels WHERE id = $1`,
        [channelId],
      );
      const updated = updatedRow.rows[0] as Record<string, unknown>;
      return reply.code(200).send(
        serializeChannel(
          {
            id: String(updated.id),
            name: String(updated.name),
            type: String(updated.type),
            position: Number(updated.position ?? 0),
            categoryId:
              typeof updated.category_id === 'string' &&
              updated.category_id.trim()
                ? updated.category_id.trim()
                : undefined,
            nsfw: Boolean(updated.nsfw),
            bitrateBps:
              updated.bitrate_bps != null ? Number(updated.bitrate_bps) : null,
            userLimit:
              updated.user_limit != null
                ? Number(updated.user_limit)
                : undefined,
          },
          guildId,
        ),
      );
    },
  );
}
