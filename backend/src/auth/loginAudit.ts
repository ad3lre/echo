import { createHmac } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { config } from '../config';

const LOGIN_AUDIT_DIGEST_BYTES = 16;

function loginAuditMacKey(): Buffer {
  return createHmac('sha256', config.jwtSecret)
    .update('echo-login-audit-v1')
    .digest();
}

/** Keyed digests for `auth_login_events` (not reversible; domain-separated from raw SHA-256). */
export function loginAuditDigests(req: FastifyRequest): {
  ipDigest: string;
  uaDigest: string;
} {
  const key = loginAuditMacKey();
  const ip = String(req.ip ?? '');
  const ua = String(req.headers['user-agent'] ?? '');
  return {
    ipDigest: createHmac('sha256', key)
      .update(`ip:${ip}`)
      .digest('hex')
      .slice(0, LOGIN_AUDIT_DIGEST_BYTES * 2),
    uaDigest: createHmac('sha256', key)
      .update(`ua:${ua}`)
      .digest('hex')
      .slice(0, LOGIN_AUDIT_DIGEST_BYTES * 2),
  };
}
