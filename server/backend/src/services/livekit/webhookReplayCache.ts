import { createHash } from 'node:crypto';
import { consumeWebhookDeliveryOnce } from '../webhookReplayGuard';

function replayKey(rawBody: string, authHeader: string | undefined): string {
  return createHash('sha256')
    .update(rawBody)
    .update('\0')
    .update(authHeader ?? '')
    .digest('hex');
}

/**
 * After signature verification, returns false if this payload was already processed
 * recently (replay). Otherwise records it and returns true.
 */
export async function acceptLiveKitWebhookOnce(
  rawBody: string,
  authHeader: string | undefined,
): Promise<boolean> {
  const key = replayKey(rawBody, authHeader);
  return consumeWebhookDeliveryOnce('livekit', key, 10 * 60);
}
