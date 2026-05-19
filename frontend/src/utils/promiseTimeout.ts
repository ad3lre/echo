/** Rejected when {@link promiseWithTimeout} elapses before the wrapped promise settles. */
export class PromiseTimeoutError extends Error {
  override readonly name = 'PromiseTimeoutError';

  constructor(
    message = 'Operation timed out',
    readonly timeoutMs?: number,
  ) {
    super(message);
  }
}

export function isPromiseTimeoutError(e: unknown): e is PromiseTimeoutError {
  return e instanceof PromiseTimeoutError;
}

/**
 * Races `promise` against a timer; clears the timer when `promise` wins.
 * Non-positive `timeoutMs` skips racing (returns `promise` unchanged).
 */
export async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options?: { label?: string },
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  const label = options?.label?.trim();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      reject(
        new PromiseTimeoutError(
          label
            ? `${label} timed out after ${timeoutMs}ms`
            : `Timed out after ${timeoutMs}ms`,
          timeoutMs,
        ),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
