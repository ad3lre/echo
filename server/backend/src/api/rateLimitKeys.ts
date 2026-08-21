import type { FastifyRequest } from 'fastify';
import { clientIpFromFastifyRequest } from '../net/clientIp';

/** Per authenticated user, else per trusted client IP (Echo API routes). */
export function authUserOrIpRateLimitKey(req: FastifyRequest): string {
  return req.authUser?.id
    ? `uid:${req.authUser.id}`
    : `ip:${clientIpFromFastifyRequest(req)}`;
}

/** Per trusted client IP (OAuth, guest mint, unauthenticated flows). */
export function ipRateLimitKey(req: FastifyRequest): string {
  return `ip:${clientIpFromFastifyRequest(req)}`;
}
