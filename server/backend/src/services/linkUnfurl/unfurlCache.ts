/**
 * In-flight coalescing + short-TTL result cache for URL unfurls.
 *
 * `unfurlUrlToEmbed` does a real outbound fetch (oEmbed and/or HTML) on every
 * call with no memoization. The same popular link posted repeatedly, or by many
 * people at once in a busy channel, fans out into one outbound fetch per message.
 * That is wasted work and a wider abuse/SSRF fetch surface than necessary.
 *
 * This wraps the per-URL resolution so that:
 *   - concurrent requests for the same URL share one in-flight fetch (coalescing,
 *     the pattern Fluxer's media proxy uses), and
 *   - a resolved result is reused for a short TTL (successes longer than failures,
 *     so a dead or rate-limiting host is not hammered, while a transient failure
 *     is retried sooner than a good preview is refetched).
 *
 * Only viewer-independent unfurls flow through here. Per-viewer Echo "jump"
 * embeds are resolved upstream in `buildLinkEmbedsFromPlainText` before this is
 * reached, so a globally shared cache cannot leak one user's access to another.
 */

import type { Embed } from '../../../../../contracts/types';
import { boundedInteger } from '../../shared/numberParsing';
import {
  echoUnfurlCacheTotal,
  type EchoUnfurlCacheOutcome,
} from '../../observability/echoMetrics';

const SUCCESS_TTL_MS = boundedInteger(
  process.env.ECHO_UNFURL_CACHE_SUCCESS_TTL_MS,
  5 * 60_000,
  1_000,
  60 * 60_000,
);
const FAILURE_TTL_MS = boundedInteger(
  process.env.ECHO_UNFURL_CACHE_FAILURE_TTL_MS,
  30_000,
  1_000,
  10 * 60_000,
);
const MAX_ENTRIES = 5_000;

type ResolvedEntry = { embed: Embed | null; expiresAt: number };

const inflight = new Map<string, Promise<Embed | null>>();
const resolved = new Map<string, ResolvedEntry>();

function prune(now: number): void {
  for (const [k, v] of resolved) {
    if (v.expiresAt > now) continue;
    resolved.delete(k);
  }
  while (resolved.size > MAX_ENTRIES) {
    const oldest = resolved.keys().next().value as string | undefined;
    if (!oldest) break;
    resolved.delete(oldest);
  }
}

function record(outcome: EchoUnfurlCacheOutcome): void {
  echoUnfurlCacheTotal.inc({ outcome });
}

/**
 * Resolve an unfurl for `url`, sharing in-flight work and reusing recent results.
 * `loader` performs the actual fetch and must be viewer-independent.
 */
export async function unfurlWithCoalescedCache(
  url: string,
  loader: () => Promise<Embed | null>,
): Promise<Embed | null> {
  const now = Date.now();

  const cached = resolved.get(url);
  if (cached && cached.expiresAt > now) {
    record('hit');
    return cached.embed;
  }
  if (cached) resolved.delete(url);

  const existing = inflight.get(url);
  if (existing) {
    record('coalesced');
    return existing;
  }

  record('miss');
  const pending = (async () => {
    try {
      const embed = await loader();
      prune(Date.now());
      resolved.set(url, {
        embed,
        expiresAt: Date.now() + (embed ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
      });
      return embed;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, pending);
  return pending;
}

export function resetEchoUnfurlCacheForTests(): void {
  inflight.clear();
  resolved.clear();
}
