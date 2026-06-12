import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as echoCsrf from '@/utils/echoCsrf';

/**
 * Desktop (Tauri WebView) auth transport matrix: session-minting endpoints must
 * stay CORS-simple (no JSON content type, no custom CSRF header) so no OPTIONS
 * preflight runs between `http://tauri.localhost` and the API. See the client
 * auth invariants in docs/infra/auth/OPTION_A_SESSION_ARCHITECTURE.md.
 */
const flags = { tauri: false };

vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>();
  return {
    ...actual,
    get IS_ECHO_TAURI_SHELL() {
      return flags.tauri;
    },
  };
});

import {
  authRegister,
  authTryCookieRefresh,
  authUpgradeGuest,
} from '@/api/authClient';

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const userBody = {
  user: {
    id: 'u1',
    username: 'u',
    displayName: 'U',
    pfp: '',
    status: 'online',
    createdAt: new Date(0).toISOString(),
  },
};

function lastFetchCall(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit;
} {
  const call = fetchMock.mock.calls.at(-1)!;
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

describe('desktop auth transport matrix (CORS-simple)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    flags.tauri = true;
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(userBody));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    flags.tauri = false;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authRegister posts form-urlencoded on desktop', async () => {
    await authRegister({
      username: 'u',
      password: 'pw-123456',
      email: 'u@test.dev',
    });
    const { init } = lastFetchCall(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );
    const params = new URLSearchParams(String(init.body));
    expect(params.get('username')).toBe('u');
    expect(params.get('email')).toBe('u@test.dev');
  });

  it('authUpgradeGuest posts form-urlencoded with csrfToken in the body, no CSRF header', async () => {
    vi.spyOn(echoCsrf, 'echoCsrfHeaders').mockReturnValue({
      'X-CSRF-Token': 'csrf-abc',
    });
    await authUpgradeGuest({ email: 'u@test.dev', password: 'pw-123456' });
    const { init } = lastFetchCall(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(headers.get('X-CSRF-Token')).toBeNull();
    const params = new URLSearchParams(String(init.body));
    expect(params.get('csrfToken')).toBe('csrf-abc');
    expect(params.get('email')).toBe('u@test.dev');
  });

  it('cookie refresh posts a CORS-simple empty form body on desktop', async () => {
    await authTryCookieRefresh();
    const { url, init } = lastFetchCall(fetchMock);
    expect(url).toContain('/auth/refresh');
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(init.body).toBe('');
  });

  it('web (non-Tauri) keeps JSON + CSRF header for guest upgrade', async () => {
    flags.tauri = false;
    vi.spyOn(echoCsrf, 'echoCsrfJsonHeaders').mockReturnValue({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'csrf-abc',
    });
    await authUpgradeGuest({ email: 'u@test.dev', password: 'pw-123456' });
    const { init } = lastFetchCall(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-abc');
  });
});
