import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import discordGatewayInfoRoutes from './rest/gateway';
import discordUsersRoutes from './rest/users';
import discordGuildsRoutes from './rest/guilds';
import discordChannelsRoutes from './rest/channels';
import discordMessagesRoutes from './rest/messages';

/**
 * Discord-compatible REST API mounted at `/discord/v10`.
 * CSRF is not enforced here (non-/api/v1 prefix is automatically exempt).
 * Authentication is via `Authorization: Bot <token>`.
 */
export default async function discordApiRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(discordGatewayInfoRoutes);
  await fastify.register(discordUsersRoutes);
  await fastify.register(discordGuildsRoutes);
  await fastify.register(discordChannelsRoutes);
  await fastify.register(discordMessagesRoutes);
}
