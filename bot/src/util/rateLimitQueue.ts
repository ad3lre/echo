import { parseRetryAfterMs } from './numberParsing.js';

/**
 * Small helper for non-discord.js HTTP (e.g. CDN asset downloads).
 * discord.js REST already rate-limits API calls internally.
 */
export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  opts: { maxRetries?: number } = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 5;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    attempt += 1;
    if (attempt > maxRetries) return res;
    const waitMs = parseRetryAfterMs(
      res.headers.get('retry-after'),
      1000 * attempt,
      1000,
      60_000,
    );
    await sleep(waitMs);
  }
}

export function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const idx = i;
      i += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  return Promise.all(Array.from({ length: n }, () => worker())).then(
    () => results,
  );
}
