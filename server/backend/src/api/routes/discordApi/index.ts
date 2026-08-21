import rateLimit from '@fastify/rate-limit';
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
  await fastify.register(async (botScope) => {
    await botScope.register(rateLimit, {
      max: 120,
      timeWindow: '1 minute',
      keyGenerator: (req) =>
        req.botApp?.id
          ? `discord_bot:${req.botApp.id}`
          : `discord_bot_ip:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });
    await botScope.register(discordGatewayInfoRoutes);
    await botScope.register(discordUsersRoutes);
    await botScope.register(discordGuildsRoutes);
    await botScope.register(discordChannelsRoutes);
    await botScope.register(discordMessagesRoutes);
  });
}
