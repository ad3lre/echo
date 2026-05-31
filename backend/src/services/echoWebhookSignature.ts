import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { safeCompare } from '../shared/safeCompare';

const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Verify `x-echo-signature-ts` + `x-echo-signature` HMAC (sha256 over `${ts}.${rawBody}`).
 * Returns false when headers are missing or invalid.
 */
export function verifyEchoWebhookHmac(
  secret: string,
  rawBody: string,
  req: FastifyRequest,
): boolean {
  const tsHdr = req.headers['x-echo-signature-ts'];
  const sigHdr = req.headers['x-echo-signature'];
  const ts = typeof tsHdr === 'string' ? tsHdr.trim() : '';
  const presented = typeof sigHdr === 'string' ? sigHdr.trim() : '';
  if (!ts || !presented || !/^\d+$/.test(ts)) return false;
  const tsMs = Number(ts);
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(Date.now() - tsMs) > MAX_SIGNATURE_SKEW_MS) return false;
  const expected = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  if (expected.length !== presented.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(presented, 'utf8'),
    );
  } catch {
    return safeCompare(expected, presented);
  }
}
