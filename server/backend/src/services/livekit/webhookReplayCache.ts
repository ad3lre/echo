import { createHash } from 'node:crypto';

const REPLAY_TTL_MS = 10 * 60 * 1000;

const seen = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of seen.entries()) {
    if (now > expiresAt) seen.delete(key);
  }
}, 60_000).unref();

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
export function acceptLiveKitWebhookOnce(
  rawBody: string,
  authHeader: string | undefined,
): boolean {
  const key = replayKey(rawBody, authHeader);
  if (seen.has(key)) return false;
  seen.set(key, Date.now() + REPLAY_TTL_MS);
  return true;
}

export function __resetLiveKitWebhookReplayCacheForTests(): void {
  seen.clear();
}
