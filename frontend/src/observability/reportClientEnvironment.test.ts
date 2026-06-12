import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportClientEnvironmentOnce } from '@/observability/reportClientEnvironment';

describe('reportClientEnvironmentOnce', () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    const sessionStore = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem(key: string) {
        return sessionStore.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        sessionStore.set(key, value);
      },
      removeItem(key: string) {
        sessionStore.delete(key);
      },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      language: 'en-US',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('window', {
      innerWidth: 1280,
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts once per tab session', () => {
    reportClientEnvironmentOnce();
    reportClientEnvironmentOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});
