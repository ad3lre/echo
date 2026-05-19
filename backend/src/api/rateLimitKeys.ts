import type { FastifyRequest } from 'fastify';

/** Per authenticated user, else per client IP (Echo API routes). */
export function authUserOrIpRateLimitKey(req: FastifyRequest): string {
  return req.authUser?.id ? `uid:${req.authUser.id}` : `ip:${req.ip}`;
}

/** Per client IP (OAuth, guest mint, unauthenticated flows). */
export function ipRateLimitKey(req: FastifyRequest): string {
  return `ip:${req.ip}`;
}
