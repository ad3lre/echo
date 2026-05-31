import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { requireBotAuth } from '../botAuth';
import { config } from '../../../../config';
import { ipRateLimitKey } from '../../../rateLimitKeys';

function buildPublicDiscordGatewayUrl(): string {
  const base = new URL(config.echoApiPublicUrl);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return new URL('/discord/gateway', base).toString();
}

export default async function discordGatewayInfoRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: ipRateLimitKey,
      addHeaders: { 'retry-after': true },
    });
    scope.get('/gateway', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        url: buildPublicDiscordGatewayUrl(),
      });
    });
  });

  fastify.get(
    '/gateway/bot',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        url: buildPublicDiscordGatewayUrl(),
        shards: 1,
        session_start_limit: {
          total: 1000,
          remaining: 999,
          reset_after: 14400000,
          max_concurrency: 1,
        },
      });
    },
  );
}
