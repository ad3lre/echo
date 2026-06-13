import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { AuthApiError, authFetchMe, invalidateAuthFetchMeCache } = vi.hoisted(
  () => {
    class AuthApiError extends Error {
      status: number;
      constructor(status: number, body: { message?: string } = {}) {
        super(body.message ?? 'auth');
        this.status = status;
      }
    }
    return {
      AuthApiError,
      authFetchMe: vi.fn(),
      invalidateAuthFetchMeCache: vi.fn(),
    };
  },
);

vi.mock('@/config', () => ({
  IS_ECHO_TAURI_SHELL: true,
}));

vi.mock('@/api/authClient', () => ({
  AuthApiError,
  authFetchMe: (...args: unknown[]) => authFetchMe(...args),
  invalidateAuthFetchMeCache: () => invalidateAuthFetchMeCache(),
}));

vi.mock('@/services/auth/nativeAuthToken', () => ({
  isNativeBearerClient: () => false,
  getNativeAccessToken: () => null,
}));

import { primeCookieSessionAfterMint } from './desktopSessionPrime';

describe('primeCookieSessionAfterMint', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ECHO_DESKTOP', '1');
    authFetchMe.mockReset();
    invalidateAuthFetchMeCache.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retries /auth/me after initial 401 then returns the user', async () => {
    authFetchMe
      .mockRejectedValueOnce(new AuthApiError(401))
      .mockResolvedValueOnce({
        user: {
          id: 'u1',
          username: 'u',
          displayName: 'U',
          pfp: '',
          status: 'online',
          createdAt: new Date(0).toISOString(),
        },
      });

    const user = await primeCookieSessionAfterMint();
    expect(user?.id).toBe('u1');
    expect(authFetchMe).toHaveBeenCalledTimes(2);
  });
});
