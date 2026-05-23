import type { FastifyRequest } from 'fastify';
import { authUserOrIpRateLimitKey, ipRateLimitKey } from './rateLimitKeys';

/** Authenticated /me link read & unlink routes. */
export const ME_FEDERATED_LINK_RATE = {
  max: 60,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

/** OAuth start/callback scopes (per IP). */
export const FEDERATED_OAUTH_FLOW_RATE = {
  max: 60,
  timeWindow: '15 minutes' as const,
  keyGenerator: (req: FastifyRequest) => `federated_oauth_flow:${req.ip}`,
  addHeaders: { 'retry-after': true as const },
};

/** Guest mint (per IP; matches guestRoutes plugin). */
export const GUEST_MINT_ROUTE_RATE = {
  max: 20,
  timeWindow: '15 minutes' as const,
  keyGenerator: ipRateLimitKey,
  addHeaders: { 'retry-after': true as const },
};
