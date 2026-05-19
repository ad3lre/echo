import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { getBotInstalledGuildIds, requireBotAuth } from '../botAuth';
import { serializeBotUser, serializeUser } from '../serializers';
import { getEchoStore } from '../../../../domain/echoStore/bootstrap';
import { getAuthStore } from '../../../../auth/store';

function discordError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ code: 0, message });
}

export default async function discordUsersRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /** GET /users/@me — returns the bot's own user object. */
  fastify.get(
    '/users/@me',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send(serializeBotUser(req.botApp!));
    },
  );

  /** GET /users/:userId — look up a user by Echo ID. */
  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.params as { userId: string }).userId.trim();
      const guildIds = await getBotInstalledGuildIds(req.botApp!.id);
      if (guildIds.length === 0) {
        return discordError(reply, 404, '404: Unknown User');
      }
      const { pool, enabled } = await getEchoStore();
      if (!enabled || !pool)
        return discordError(reply, 503, '503: Service Unavailable');
      const overlap = await pool.query(
        `SELECT 1 FROM echo_server_members WHERE user_id = $1 AND server_id = ANY($2::text[]) LIMIT 1`,
        [userId, guildIds],
      );
      if (overlap.rows.length === 0) {
        return discordError(reply, 404, '404: Unknown User');
      }
      const { store } = await getAuthStore();
      const user = await store.getUserById(userId);
      if (!user) {
        return discordError(reply, 404, '404: Unknown User');
      }
      return reply.code(200).send(
        serializeUser({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          pfp: user.pfp,
        }),
      );
    },
  );
}
