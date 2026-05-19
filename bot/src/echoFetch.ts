import { sleep } from './util/rateLimitQueue.js';

const ECHO_WEBHOOK_FETCH_RETRIES = 5;
const ECHO_WEBHOOK_RETRY_DELAY_MS = 350;

function isLikelyTransientFetchFailure(e: unknown): boolean {
  const cause =
    e && typeof e === 'object' && 'cause' in e
      ? (e as { cause?: unknown }).cause
      : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code ?? '')
      : '';
  return (
    code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EAI_AGAIN'
  );
}

/** Echo API may restart (nodemon) or start after the bot; retry connect failures briefly. */
export async function fetchEchoWebhook(
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let i = 0; i < ECHO_WEBHOOK_FETCH_RETRIES; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      const retry =
        i < ECHO_WEBHOOK_FETCH_RETRIES - 1 && isLikelyTransientFetchFailure(e);
      if (retry) {
        await sleep(ECHO_WEBHOOK_RETRY_DELAY_MS * (i + 1));
        continue;
      }
      throw e;
    }
  }
  throw new Error('fetchEchoWebhook: unreachable');
}
