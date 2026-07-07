import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  isNativeBearerClient: vi.fn(() => true),
  getNativeRefreshTokenForLogout: vi.fn(async () => null as string | null),
}));

vi.mock('@/services/auth/nativeAuthToken', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/auth/nativeAuthToken')>();
  return {
    ...actual,
    isNativeBearerClient: nativeMocks.isNativeBearerClient,
    getNativeRefreshTokenForLogout: nativeMocks.getNativeRefreshTokenForLogout,
    nativeAuthRequestHeaders: () => ({ 'X-Echo-Client': 'desktop' }),
  };
});

import { backfillNativeBearerFromCookiesIfNeeded } from './authClient';

describe('backfillNativeBearerFromCookiesIfNeeded', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    nativeMocks.isNativeBearerClient.mockReturnValue(true);
    nativeMocks.getNativeRefreshTokenForLogout.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: {
              id: 'u1',
              username: 'u',
              displayName: 'U',
              pfp: '',
              status: 'online',
              createdAt: new Date(0).toISOString(),
            },
            csrfToken: 'csrf',
            auth: {
              accessToken: 'at',
              refreshToken: 'rt',
              expiresInSec: 900,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips when not a native bearer client', async () => {
    nativeMocks.isNativeBearerClient.mockReturnValue(false);
    await backfillNativeBearerFromCookiesIfNeeded();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips when keychain already holds a refresh token', async () => {
    nativeMocks.getNativeRefreshTokenForLogout.mockResolvedValue('existing-rt');
    await backfillNativeBearerFromCookiesIfNeeded();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs /auth/refresh when keychain is empty', async () => {
    await backfillNativeBearerFromCookiesIfNeeded();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain('/auth/refresh');
    expect((init as RequestInit).credentials).toBe('include');
  });
});
