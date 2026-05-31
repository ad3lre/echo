import type { FastifyContextConfig } from 'fastify';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';

/** Echo server settings, channels, roles, and permission mutations (per user/IP). */
export const ECHO_ADMIN_MUTATION_RATE_LIMIT: NonNullable<
  FastifyContextConfig['rateLimit']
> = {
  max: 30,
  timeWindow: '1 minute',
  keyGenerator: authUserOrIpRateLimitKey,
};
