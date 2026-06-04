import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

function readHeader(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

/** Verify HMAC from backend livekitWebhook forwarder (`ts.body`, LIVEKIT_API_SECRET). */
export function verifyEchoForwardSignature(
  req: FastifyRequest,
  rawBody: string,
  secret: string,
): boolean {
  const ts = readHeader(req, 'x-echo-signature-ts');
  const sig = readHeader(req, 'x-echo-signature');
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;

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
