/**
 * Browsers surface blocked CORS, DNS/TLS failures, and some aborted loads as
 * `TypeError: Failed to fetch` with no response body. WebView2 / Edge sometimes
 * use `DOMException` (`NetworkError`) or other `Error` shapes with the same text.
 * After desktop OAuth, credentialed cross-origin calls can fail briefly while
 * cookies settle or navigation completes.
 */
function errorName(e: unknown): string {
  if (typeof e !== 'object' || e === null) return '';
  const n = (e as { name?: unknown }).name;
  return typeof n === 'string' ? n : '';
}

function errorMessage(e: unknown): string {
  if (typeof e !== 'object' || e === null) return '';
  const m = (e as { message?: unknown }).message;
  return typeof m === 'string' ? m : '';
}

/** True when the value looks like an HTTP-layer API error (do not treat as transport failure). */
function looksLikeHttpApiError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const status = (e as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 600;
}

export function isTransientFetchFailure(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false;
  const name = errorName(e);
  if (name === 'AbortError') return false;
  if (looksLikeHttpApiError(e)) return false;

  const msg = `${name} ${errorMessage(e)}`.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('err_connection') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('internet connection')
  );
}

function defaultRetryDelaysMs(): readonly number[] {
  return import.meta.env.VITE_ECHO_TAURI === '1'
    ? [0, 300, 900, 2200]
    : [0, 120, 400];
}

export async function withTransientFetchRetries<T>(
  fn: () => Promise<T>,
  delaysMs?: readonly number[],
): Promise<T> {
  const schedule = delaysMs ?? defaultRetryDelaysMs();
  let last: unknown;
  for (let i = 0; i < schedule.length; i += 1) {
    const wait = schedule[i]!;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      return await fn();
    } catch (e) {
      last = e;
      const more = i < schedule.length - 1;
      if (!more || !isTransientFetchFailure(e)) {
        throw e;
      }
    }
  }
  throw last;
}
