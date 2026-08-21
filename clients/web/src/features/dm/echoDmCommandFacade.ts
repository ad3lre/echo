import { postEchoOpenDm, postEchoOpenGroupDm } from '@/api/echo/social';
import { EchoApiError } from '@/api/echo/transport';

export type OpenEchoGroupDmChannelInput = {
  memberUserIds: string[];
  name?: string;
};

/** Default cap for `/dm/open` — mobile Safari often suspends fetches in background, which can look like an infinite load. */
export const ECHO_DM_OPEN_DEFAULT_TIMEOUT_MS = 45_000;

/** Backoff before the single retry attempt on transient `/dm/open` failures (CDN cold start, gateway hiccup). */
export const ECHO_DM_OPEN_TRANSIENT_RETRY_DELAY_MS = 350;

export function normalizeEchoDmChannelId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export type OpenEchoDmChannelOptions = {
  /** Abort external cancellation (e.g. user navigates away). */
  signal?: AbortSignal;
  /**
   * Client-side timeout; creates an internal `AbortSignal` unless `signal` is set.
   * Set to `null` to disable (tests or special cases).
   */
  timeoutMs?: number | null;
  /** Override the transient-failure backoff (tests). */
  transientRetryDelayMs?: number;
};

/**
 * Treats 5xx responses, request-timeout family (408/425), and bare `TypeError: Failed to fetch`
 * network blips as transient. AbortError, regular 4xx, and CSRF/auth errors are deliberately not
 * retried so user mistakes and stale sessions surface immediately.
 */
function isTransientDmOpenError(err: unknown): boolean {
  if (err instanceof EchoApiError) {
    if (err.status >= 500) return true;
    if (err.status === 408 || err.status === 425) return true;
    return false;
  }
  if (err instanceof TypeError) {
    /* `TypeError: Failed to fetch` and friends — DNS/preflight/connection reset. */
    return true;
  }
  return false;
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

async function delayMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const tid = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(tid);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(tid);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export async function openEchoDirectDmChannel(
  token: string,
  peerUserId: string,
  opts?: OpenEchoDmChannelOptions,
): Promise<string> {
  const timeoutMs =
    opts?.timeoutMs === null
      ? null
      : (opts?.timeoutMs ?? ECHO_DM_OPEN_DEFAULT_TIMEOUT_MS);
  const retryDelayMs =
    opts?.transientRetryDelayMs ?? ECHO_DM_OPEN_TRANSIENT_RETRY_DELAY_MS;
  let cancelTimer: (() => void) | undefined;
  let signal = opts?.signal;
  if (!signal && timeoutMs != null && timeoutMs > 0) {
    const ac = new AbortController();
    signal = ac.signal;
    const tid = setTimeout(() => ac.abort(), timeoutMs);
    cancelTimer = () => clearTimeout(tid);
  }
  try {
    try {
      const response = await postEchoOpenDm(
        token,
        peerUserId,
        signal ? { signal } : undefined,
      );
      return normalizeEchoDmChannelId(response?.channelId);
    } catch (err) {
      if (isAbortError(err) || !isTransientDmOpenError(err)) throw err;
      /* "First shot" failures: occasionally a stale cookie / CDN hiccup causes `/dm/open` to fail
       * with no actionable body. One quick retry recovers without surfacing a user-visible error. */
      await delayMs(retryDelayMs, signal);
      const response = await postEchoOpenDm(
        token,
        peerUserId,
        signal ? { signal } : undefined,
      );
      return normalizeEchoDmChannelId(response?.channelId);
    }
  } finally {
    cancelTimer?.();
  }
}

export async function openEchoGroupDmChannel(
  token: string,
  body: OpenEchoGroupDmChannelInput,
  opts?: OpenEchoDmChannelOptions,
): Promise<string> {
  const timeoutMs =
    opts?.timeoutMs === null
      ? null
      : (opts?.timeoutMs ?? ECHO_DM_OPEN_DEFAULT_TIMEOUT_MS);
  const retryDelayMs =
    opts?.transientRetryDelayMs ?? ECHO_DM_OPEN_TRANSIENT_RETRY_DELAY_MS;
  let cancelTimer: (() => void) | undefined;
  let signal = opts?.signal;
  if (!signal && timeoutMs != null && timeoutMs > 0) {
    const ac = new AbortController();
    signal = ac.signal;
    const tid = setTimeout(() => ac.abort(), timeoutMs);
    cancelTimer = () => clearTimeout(tid);
  }
  try {
    try {
      const response = await postEchoOpenGroupDm(
        token,
        body,
        signal ? { signal } : undefined,
      );
      return normalizeEchoDmChannelId(response?.channelId);
    } catch (err) {
      if (isAbortError(err) || !isTransientDmOpenError(err)) throw err;
      await delayMs(retryDelayMs, signal);
      const response = await postEchoOpenGroupDm(
        token,
        body,
        signal ? { signal } : undefined,
      );
      return normalizeEchoDmChannelId(response?.channelId);
    }
  } finally {
    cancelTimer?.();
  }
}
