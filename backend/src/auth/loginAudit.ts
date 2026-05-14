import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';

/** Short SHA-256 digests for `auth_login_events` (not reversible). */
export function loginAuditDigests(req: FastifyRequest): {
  ipDigest: string;
  uaDigest: string;
} {
  const ip = String(req.ip ?? '');
  const ua = String(req.headers['user-agent'] ?? '');
  return {
    ipDigest: createHash('sha256').update(ip).digest('hex').slice(0, 16),
    uaDigest: createHash('sha256').update(ua).digest('hex').slice(0, 16),
  };
}
