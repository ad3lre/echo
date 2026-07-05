/** Bounded retry for GET /auth/me when the global rate limiter returns 429. */
export const AUTH_FETCH_ME_429_MAX_RETRIES = 3;

export function authFetchMeRetryAfterMs(
  retryAfterHeader: string | null,
  attempt: number,
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(1000 * (attempt + 1), 5000);
}

export async function fetchAuthMeWith429Retry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let res: Response | undefined;
  for (let attempt = 0; attempt <= AUTH_FETCH_ME_429_MAX_RETRIES; attempt++) {
    res = await fetch(url, init);
    if (res.status === 429 && attempt < AUTH_FETCH_ME_429_MAX_RETRIES) {
      const waitMs = authFetchMeRetryAfterMs(
        res.headers.get('Retry-After'),
        attempt,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }
  if (!res) throw new Error('GET /auth/me failed');
  return res;
}
