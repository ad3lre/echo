import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PromiseTimeoutError,
  isPromiseTimeoutError,
  promiseWithTimeout,
} from './promiseTimeout';

describe('promiseWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('resolves when the promise wins', async () => {
    const p = Promise.resolve(42);
    const wrapped = promiseWithTimeout(p, 1000);
    await vi.runAllTimersAsync();
    await expect(wrapped).resolves.toBe(42);
  });

  it('rejects with PromiseTimeoutError when the timer wins', async () => {
    const p = new Promise<number>(() => {
      /* never */
    });
    const wrapped = promiseWithTimeout(p, 1000, { label: 'fetch' });
    const assertRejected = expect(wrapped).rejects.toMatchObject({
      name: 'PromiseTimeoutError',
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertRejected;
  });

  it('clears the timer when the promise settles first', async () => {
    let resolved = false;
    const p = new Promise<number>((r) => {
      setTimeout(() => {
        resolved = true;
        r(7);
      }, 500);
    });
    const wrapped = promiseWithTimeout(p, 10_000);
    await vi.advanceTimersByTimeAsync(500);
    await expect(wrapped).resolves.toBe(7);
    expect(resolved).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
  });

  it('passes through when timeoutMs is 0', async () => {
    await expect(promiseWithTimeout(Promise.resolve(1), 0)).resolves.toBe(1);
  });
});

describe('isPromiseTimeoutError', () => {
  it('narrows PromiseTimeoutError', () => {
    const e = new PromiseTimeoutError('x', 1);
    expect(isPromiseTimeoutError(e)).toBe(true);
    expect(isPromiseTimeoutError(new Error('x'))).toBe(false);
  });
});
