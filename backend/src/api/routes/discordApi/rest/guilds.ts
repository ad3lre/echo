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
import {
  serializeGuild,
  serializeChannel,
  serializeGuildMember,
  serializeUser,
  permsBitfield,
} from '../serializers';
import { getEchoStore } from '../../../../domain/echoStore/bootstrap';
import {
  listEchoRolesForServer,
  listEchoChannelsForUser,
  assignEchoMemberRole,
  removeEchoMemberRole,
  removeEchoServerMember,
  setEchoMemberNickname,
  isEchoServerOwner,
} from '../../../../domain/echoStore';
import { getAuthStore } from '../../../../auth/store';
import { hasServerPermission } from '../../../../domain/echoPolicy';

function discordError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ code: 0, message });
}

async function assertBotInGuild(
  botId: string,
  guildId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const installed = await getBotInstalledGuildIds(botId);
  if (!installed.includes(guildId)) {
    discordError(reply, 403, '403: Missing Access');
    return false;
  }
  return true;
}

/**
 * Check if the bot (via its installer/owner) is allowed to perform a management action.
 * Since Echo doesn't have bot roles yet, we treat the bot as having the permissions
 * of the user who installed it, provided they are still in the guild.
 */
async function assertBotActionAllowed(
  pool: import('pg').Pool,
  botId: string,
  guildId: string,
  permission: import('../../../../domain/echoPermissionPrimitives').EchoPermission,
  reply: FastifyReply,
): Promise<string | null> {
  const installerId = await getBotInstallerUserId(botId, guildId);
  if (!installerId) {
    discordError(reply, 403, '403: Missing Access (No Installer)');
    return null;
  }
  const isOwner = await isEchoServerOwner(pool, guildId, installerId);
  const hasPerm =
    isOwner ||
    (await hasServerPermission(pool, installerId, guildId, permission));
  if (!hasPerm) {
    discordError(reply, 403, `403: Missing Permissions (${permission})`);
    return null;
  }
  return installerId;
}

export default async function discordGuildsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /** GET /guilds/:guildId */
  fastify.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const guildId = (req.params as { guildId: string }).guildId.trim();
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const serverRow = await pool.query(
        `SELECT id, name, icon_url, owner_id, description FROM echo_servers WHERE id = $1`,
        [guildId],
      );
      if (serverRow.rows.length === 0) {
        return discordError(reply, 404, '404: Unknown Guild');
      }
      const s = serverRow.rows[0] as Record<string, unknown>;

      const [roles, countRow] = await Promise.all([
        listEchoRolesForServer(pool, guildId),
        pool.query(
          `SELECT COUNT(*)::int AS cnt FROM echo_server_members WHERE server_id = $1`,
          [guildId],
        ),
      ]);

      const memberCount = Number(countRow.rows[0]?.cnt ?? 0);
      return reply.code(200).send(
        serializeGuild(
          {
            id: String(s.id),
            name: String(s.name),
            iconUrl: String(s.icon_url ?? ''),
            ownerId: String(s.owner_id),
            description:
              typeof s.description === 'string' ? s.description : undefined,
          },
          roles,
          memberCount,
        ),
      );
    },
  );

  /** GET /guilds/:guildId/channels */
  fastify.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/channels',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const guildId = (req.params as { guildId: string }).guildId.trim();
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const installerId = await getBotInstallerUserId(req.botApp!.id, guildId);
      if (!installerId) {
        return discordError(reply, 403, '403: Missing Access (No Installer)');
      }

      const channels = await listEchoChannelsForUser(
        pool,
        guildId,
        installerId,
      );
      return reply.code(200).send(
        channels.map((ch) =>
          serializeChannel(
            {
              id: ch.id,
              name: ch.name,
              type: ch.type,
              position: ch.position,
              categoryId: ch.categoryId || undefined,
              nsfw: ch.nsfw,
              bitrateBps: ch.bitrateBps,
              userLimit: ch.userLimit,
            },
            guildId,
          ),
        ),
      );
    },
  );

  /** GET /guilds/:guildId/roles */
  fastify.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/roles',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const guildId = (req.params as { guildId: string }).guildId.trim();
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const roles = await listEchoRolesForServer(pool, guildId);
      return reply.code(200).send(
        roles.map((r) => ({
          id: r.id,
          name: r.name,
          color: 0,
          hoist: r.hoist,
          icon: null,
          unicode_emoji: null,
          position: r.position,
          permissions: permsBitfield(r.permissions),
          managed: false,
          mentionable: false,
          tags: {},
        })),
      );
    },
  );

  /** GET /guilds/:guildId/members?limit&after */
  fastify.get<{
    Params: { guildId: string };
    Querystring: { limit?: string; after?: string };
  }>(
    '/guilds/:guildId/members',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const guildId = (req.params as { guildId: string }).guildId.trim();
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const qs = req.query as { limit?: string; after?: string };
      const limit = Math.min(
        1000,
        Math.max(1, parseInt(qs.limit ?? '100', 10) || 100),
      );
      const after = qs.after?.trim() ?? '';

      const memberRows = await pool.query(
        `SELECT m.user_id, m.joined_at, m.nickname,
                u.username, u.display_name, u.pfp
         FROM echo_server_members m
         INNER JOIN auth_users u ON u.id = m.user_id
         WHERE m.server_id = $1
           AND ($2::text = '' OR m.user_id > $2)
         ORDER BY m.user_id ASC
         LIMIT $3`,
        [guildId, after, limit],
      );

      const userIds = memberRows.rows.map((r: Record<string, unknown>) =>
        String(r.user_id),
      );
      const rolesByUser: Record<string, string[]> = {};
      if (userIds.length > 0) {
        const roleRows = await pool.query(
          `SELECT user_id, role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = ANY($2::text[])`,
          [guildId, userIds],
        );
        for (const row of roleRows.rows as Record<string, unknown>[]) {
          const uid = String(row.user_id);
          if (!rolesByUser[uid]) rolesByUser[uid] = [];
          rolesByUser[uid].push(String(row.role_id));
        }
      }

      const members = memberRows.rows.map((row: Record<string, unknown>) => {
        const userId = String(row.user_id);
        const joinedRaw = row.joined_at;
        const joinedAt =
          joinedRaw instanceof Date
            ? joinedRaw.toISOString()
            : typeof joinedRaw === 'string' && joinedRaw
              ? new Date(joinedRaw).toISOString()
              : new Date(0).toISOString();
        return serializeGuildMember(
          {
            userId,
            username:
              typeof row.username === 'string' ? row.username : undefined,
            displayName:
              typeof row.display_name === 'string'
                ? row.display_name
                : undefined,
            pfp: typeof row.pfp === 'string' ? row.pfp : undefined,
            serverNickname:
              typeof row.nickname === 'string' && row.nickname.trim()
                ? row.nickname.trim()
                : undefined,
            joinedAt,
          },
          rolesByUser[userId] ?? [],
        );
      });

      return reply.code(200).send(members);
    },
  );

  /** GET /guilds/:guildId/members/:userId */
  fastify.get<{ Params: { guildId: string; userId: string } }>(
    '/guilds/:guildId/members/:userId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const guildId = (
        req.params as { guildId: string; userId: string }
      ).guildId.trim();
      const userId = (
        req.params as { guildId: string; userId: string }
      ).userId.trim();
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const memberRow = await pool.query(
        `SELECT m.user_id, m.joined_at, m.nickname, u.username, u.display_name, u.pfp
         FROM echo_server_members m
         INNER JOIN auth_users u ON u.id = m.user_id
         WHERE m.server_id = $1 AND m.user_id = $2`,
        [guildId, userId],
      );
      if (memberRow.rows.length === 0) {
        return discordError(reply, 404, '404: Unknown Member');
      }

      const row = memberRow.rows[0] as Record<string, unknown>;
      const roleRows = await pool.query(
        `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
        [guildId, userId],
      );
      const roleIds = roleRows.rows.map((r: Record<string, unknown>) =>
        String(r.role_id),
      );

      const joinedRaw = row.joined_at;
      const joinedAt =
        joinedRaw instanceof Date
          ? joinedRaw.toISOString()
          : typeof joinedRaw === 'string' && joinedRaw
            ? new Date(joinedRaw).toISOString()
            : new Date(0).toISOString();

      return reply.code(200).send(
        serializeGuildMember(
          {
            userId: String(row.user_id),
            username:
              typeof row.username === 'string' ? row.username : undefined,
            displayName:
              typeof row.display_name === 'string'
                ? row.display_name
                : undefined,
            pfp: typeof row.pfp === 'string' ? row.pfp : undefined,
            serverNickname:
              typeof row.nickname === 'string' && row.nickname.trim()
                ? row.nickname.trim()
                : undefined,
            joinedAt,
          },
          roleIds,
        ),
      );
    },
  );

  /** PATCH /guilds/:guildId/members/:userId — update nick/roles/mute/deaf */
  fastify.patch<{
    Params: { guildId: string; userId: string };
    Body: {
      nick?: string | null;
      roles?: string[];
      mute?: boolean;
      deaf?: boolean;
    };
  }>(
    '/guilds/:guildId/members/:userId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { guildId, userId } = req.params as {
        guildId: string;
        userId: string;
      };
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const body = req.body as { nick?: string | null; roles?: string[] };

      if (body.nick !== undefined) {
        const actorId = await assertBotActionAllowed(
          pool,
          req.botApp!.id,
          guildId,
          'MANAGE_NICKNAMES',
          reply,
        );
        if (!actorId) return;
        const nickVal = typeof body.nick === 'string' ? body.nick.trim() : '';
        await setEchoMemberNickname(pool, guildId, actorId, userId, nickVal);
      }

      if (Array.isArray(body.roles)) {
        const actorId = await assertBotActionAllowed(
          pool,
          req.botApp!.id,
          guildId,
          'MANAGE_ROLES',
          reply,
        );
        if (!actorId) return;

        const currentRolesRes = await pool.query(
          `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
          [guildId, userId],
        );
        const currentRoleIds = new Set(
          currentRolesRes.rows.map((r) => String(r.role_id)),
        );
        const targetRoleIds = new Set(body.roles);

        for (const rid of targetRoleIds) {
          if (!currentRoleIds.has(rid)) {
            await assignEchoMemberRole(pool, guildId, actorId, userId, rid);
          }
        }
        for (const rid of currentRoleIds) {
          if (!targetRoleIds.has(rid)) {
            await removeEchoMemberRole(pool, guildId, actorId, userId, rid);
          }
        }
      }

      return reply.code(200).send({});
    },
  );

  /** PUT /guilds/:guildId/members/:userId/roles/:roleId */
  fastify.put<{ Params: { guildId: string; userId: string; roleId: string } }>(
    '/guilds/:guildId/members/:userId/roles/:roleId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { guildId, userId, roleId } = req.params as {
        guildId: string;
        userId: string;
        roleId: string;
      };
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const actorId = await assertBotActionAllowed(
        pool,
        req.botApp!.id,
        guildId,
        'MANAGE_ROLES',
        reply,
      );
      if (!actorId) return;

      const r = await assignEchoMemberRole(
        pool,
        guildId,
        actorId,
        userId,
        roleId,
      );
      if (r === 'forbidden') return discordError(reply, 403, '403: Forbidden');
      return reply.code(204).send();
    },
  );

  /** DELETE /guilds/:guildId/members/:userId/roles/:roleId */
  fastify.delete<{
    Params: { guildId: string; userId: string; roleId: string };
  }>(
    '/guilds/:guildId/members/:userId/roles/:roleId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { guildId, userId, roleId } = req.params as {
        guildId: string;
        userId: string;
        roleId: string;
      };
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const actorId = await assertBotActionAllowed(
        pool,
        req.botApp!.id,
        guildId,
        'MANAGE_ROLES',
        reply,
      );
      if (!actorId) return;

      const r = await removeEchoMemberRole(
        pool,
        guildId,
        actorId,
        userId,
        roleId,
      );
      if (r === 'forbidden') return discordError(reply, 403, '403: Forbidden');
      return reply.code(204).send();
    },
  );

  /** DELETE /guilds/:guildId/members/:userId — kick */
  fastify.delete<{ Params: { guildId: string; userId: string } }>(
    '/guilds/:guildId/members/:userId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { guildId, userId } = req.params as {
        guildId: string;
        userId: string;
      };
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const actorId = await assertBotActionAllowed(
        pool,
        req.botApp!.id,
        guildId,
        'KICK_MEMBERS',
        reply,
      );
      if (!actorId) return;

      // Note: removeEchoServerMember doesn't check hierarchy. We should use canActorModerateTargetMember.
      const { canActorModerateTargetMember } =
        await import('../../../../domain/echoStore');
      const canKick = await canActorModerateTargetMember(
        pool,
        guildId,
        actorId,
        userId,
        'KICK_MEMBERS',
      );
      if (!canKick) return discordError(reply, 403, '403: Forbidden');

      await removeEchoServerMember(pool, guildId, userId);
      return reply.code(204).send();
    },
  );

  /** GET /guilds/:guildId/bans */
  fastify.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/bans',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const guildId = (req.params as { guildId: string }).guildId.trim();
      if (!(await assertBotInGuild(req.botApp!.id, guildId, reply))) return;

      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');

      const actorId = await assertBotActionAllowed(
        pool,
        req.botApp!.id,
        guildId,
        'BAN_MEMBERS',
        reply,
      );
      if (!actorId) return;

      const bans = await pool.query(
        `SELECT b.user_id, b.reason, u.username, u.display_name, u.pfp
         FROM echo_server_bans b
         LEFT JOIN auth_users u ON u.id = b.user_id
         WHERE b.server_id = $1 ORDER BY b.created_at DESC`,
        [guildId],
      );

      return reply.code(200).send(
        bans.rows.map((row: Record<string, unknown>) => ({
          reason: typeof row.reason === 'string' ? row.reason : null,
          user: serializeUser({
            id: String(row.user_id),
            username: typeof row.username === 'string' ? row.username : 'user',
            displayName:
              typeof row.display_name === 'string'
                ? row.display_name
                : undefined,
            pfp: typeof row.pfp === 'string' ? row.pfp : undefined,
          }),
        })),
      );
    },
  );
}
