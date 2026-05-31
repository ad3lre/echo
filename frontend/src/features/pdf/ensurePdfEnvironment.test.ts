import { describe, expect, it, vi } from 'vitest';

describe('ensurePdfEnvironmentPolyfills', () => {
  it('defines Promise.withResolvers when missing', async () => {
    vi.resetModules();
    const prev = Promise.withResolvers;
    // @ts-expect-error test override
    delete Promise.withResolvers;

    const { ensurePdfEnvironmentPolyfills } =
      await import('./ensurePdfEnvironment');
    ensurePdfEnvironmentPolyfills();

    expect(typeof Promise.withResolvers).toBe('function');
    const { promise, resolve } = Promise.withResolvers<number>();
    resolve(1);
    await expect(promise).resolves.toBe(1);

    Promise.withResolvers = prev;
  });
});
