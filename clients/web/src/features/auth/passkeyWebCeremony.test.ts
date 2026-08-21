import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPasskeyLoginCache,
  clearPasskeyRegistrationCache,
  getCachedPasskeyLoginOptions,
  getCachedPasskeyRegistrationOptions,
  passkeyLoginIdentFromRaw,
  prefetchPasskeyLoginOptions,
  prefetchPasskeyRegistrationOptions,
} from './passkeyWebCeremony';

vi.mock('@/api/authClient', () => ({
  authPasskeyRegisterOptions: vi.fn(async () => ({
    options: { challenge: 'reg-chal' },
    challengeId: 'reg-id',
  })),
  authPasskeyLoginOptions: vi.fn(async () => ({
    options: { challenge: 'login-chal' },
    challengeId: 'login-id',
  })),
  authPasskeyRegisterVerify: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

describe('passkeyWebCeremony cache', () => {
  beforeEach(() => {
    clearPasskeyRegistrationCache();
    clearPasskeyLoginCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passkeyLoginIdentFromRaw maps email vs username', () => {
    expect(passkeyLoginIdentFromRaw('')).toEqual({});
    expect(passkeyLoginIdentFromRaw('alice')).toEqual({ username: 'alice' });
    expect(passkeyLoginIdentFromRaw('a@b.co')).toEqual({ email: 'a@b.co' });
  });

  it('serves prefetched registration options', async () => {
    expect(getCachedPasskeyRegistrationOptions()).toBeNull();
    await prefetchPasskeyRegistrationOptions();
    expect(getCachedPasskeyRegistrationOptions()).toEqual({
      options: { challenge: 'reg-chal' },
      challengeId: 'reg-id',
    });
  });

  it('scopes login cache to ident', async () => {
    await prefetchPasskeyLoginOptions({ username: 'alice' });
    expect(getCachedPasskeyLoginOptions({ username: 'alice' })).toEqual({
      options: { challenge: 'login-chal' },
      challengeId: 'login-id',
    });
    expect(getCachedPasskeyLoginOptions({ username: 'bob' })).toBeNull();
  });
});
