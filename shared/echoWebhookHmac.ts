import { createHmac, timingSafeEqual } from 'node:crypto';

/** Max clock skew for `x-echo-signature-ts` (5 minutes). */
export const ECHO_WEBHOOK_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export type EchoWebhookSignatureHeaders = {
  'x-echo-signature-ts': string;
  'x-echo-signature': string;
};

/** HMAC-SHA256 over `${ts}.${rawBody}` — used by bot POST hooks and backend verification. */
export function signEchoWebhookBody(
  secret: string,
  rawBody: string,
  tsMs: number = Date.now(),
): EchoWebhookSignatureHeaders & { rawBody: string; tsMs: number } {
  const ts = String(tsMs);
  const signature = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  return {
    rawBody,
    tsMs,
    'x-echo-signature-ts': ts,
    'x-echo-signature': signature,
  };
}

function safeCompareHex(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(left, 'utf8'),
      Buffer.from(right, 'utf8'),
    );
  } catch {
    return left === right;
  }
}

/** Verify webhook HMAC headers against the raw request body bytes. */
export function verifyEchoWebhookBodyHmac(
  secret: string,
  rawBody: string,
  ts: string,
  signature: string,
  nowMs: number = Date.now(),
): boolean {
  const trimmedTs = ts.trim();
  const presented = signature.trim();
  if (!trimmedTs || !presented || !/^\d+$/.test(trimmedTs)) return false;
  const tsMs = Number(trimmedTs);
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(nowMs - tsMs) > ECHO_WEBHOOK_SIGNATURE_MAX_SKEW_MS) return false;
  const expected = createHmac('sha256', secret)
    .update(`${trimmedTs}.${rawBody}`)
    .digest('hex');
  return safeCompareHex(expected, presented);
}
