import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

/** Max clock skew for `x-echo-signature-ts` (5 min) — matches shared/echoWebhookHmac. */
export const ECHO_FORWARD_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

function readHeader(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

/**
 * Verify HMAC from backend livekitWebhook forwarder (`ts.body`, LIVEKIT_API_SECRET).
 * The backend signs `ts` as `Date.now()` (ms); we reject timestamps outside a ±5 min
 * window so a captured signature cannot be replayed indefinitely.
 */
export function verifyEchoForwardSignature(
  req: FastifyRequest,
  rawBody: string,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  const ts = readHeader(req, 'x-echo-signature-ts');
  const sig = readHeader(req, 'x-echo-signature');
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;

  const tsMs = Number(ts);
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(nowMs - tsMs) > ECHO_FORWARD_SIGNATURE_MAX_SKEW_MS) return false;

  const expected = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');

  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
