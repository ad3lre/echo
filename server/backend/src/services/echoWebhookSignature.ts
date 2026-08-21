import type { FastifyRequest } from 'fastify';
import { verifyEchoWebhookBodyHmac } from '../../../../contracts/echoWebhookHmac';

export {
  signEchoWebhookBody,
  verifyEchoWebhookBodyHmac,
} from '../../../../contracts/echoWebhookHmac';

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
  const ts = typeof tsHdr === 'string' ? tsHdr : '';
  const signature = typeof sigHdr === 'string' ? sigHdr : '';
  return verifyEchoWebhookBodyHmac(secret, rawBody, ts, signature);
}
