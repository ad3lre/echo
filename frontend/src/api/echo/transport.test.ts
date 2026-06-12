import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { echoT, initEchoI18n } from '@/i18n';
import * as echoMode from '@/echoMode';
import * as authClient from '@/api/authClient';
import * as authSessionStore from '@/stores/authSession';
import * as echoCsrf from '@/utils/echoCsrf';
import { registerAuthSessionApiBridge } from '@/api/authSessionBridge';
import { EchoApiError, echoFetch, trimEchoPathSegment } from './transport';

describe('trimEchoPathSegment', () => {
  it('trims ASCII whitespace', () => {
    expect(trimEchoPathSegment('  ch_1  ')).toBe('ch_1');
  });

  it('leaves inner spaces intact', () => {
    expect(trimEchoPathSegment('a b')).toBe('a b');
  });
});

describe('EchoApiError message fallback', () => {
  beforeAll(async () => {
    await initEchoI18n('en-US');
  });

  it('uses friendly server copy when body has no message/code (5xx)', () => {
    const err = new EchoApiError(503, { code: 'UNKNOWN', message: '' });
    expect(err.message).toBe(echoT('errors.api.serverUnavailable'));
  });

  it('uses friendly request copy when code is missing (non-5xx)', () => {
    const err = new EchoApiError(502, {
      code: '',
      message: '',
    } as unknown as { code: string; message: string });
    expect(err.message).toBe(echoT('errors.api.serverUnavailable'));
  });

  it('prefers explicit message over the HTTP fallback', () => {
    const err = new EchoApiError(429, {
      code: 'RATE_LIMITED',
      message: 'Slow down',
    });
    expect(err.message).toBe('Slow down');
  });

  it('falls back to generic copy when code has no i18n entry', () => {
    const err = new EchoApiError(403, { code: 'CSRF_REQUIRED', message: '' });
    expect(err.message).toBe(echoT('errors.api.unknown'));
  });

  it('prefers translated detail over base message when present', () => {
    const err = new EchoApiError(400, {
      code: 'INVALID_BODY',
      message: 'Bad input',
      detail: 'NOT_FOUND',
    });
    expect(err.message).toBe(echoT('errors.api.NOT_FOUND'));
  });

  it('does not append raw technical detail tokens', () => {
    const err = new EchoApiError(400, {
      code: 'INVALID_BODY',
      message: 'Bad input',
      detail: 'peerUserId required',
    });
    expect(err.message).toBe(echoT('errors.api.INVALID_BODY'));
  });
});

describe('echoFetch', () => {
  beforeEach(() => {
    vi.spyOn(echoMode, 'assertEchoApiAllowed').mockImplementation(() => {});
    vi.spyOn(authSessionStore, 'useAuthSessionStore').mockReturnValue({
      authStateGeneration: 0,
      applyRestoredProfile: vi.fn(),
      invalidateSessionForReauth: vi.fn(),
    } as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects successful responses with non-JSON bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'http://test/api/v1/echo/x',
        headers: { get: () => null },
        text: async () => '<html>bad gateway page</html>',
      }),
    );
    await expect(echoFetch(null, '/x')).rejects.toThrow(/non-JSON/);
  });

  it('allows empty body on success (e.g. 204-style)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        url: 'http://test/api/v1/echo/x',
        headers: { get: () => null },
        text: async () => '',
      }),
    );
    const out = await echoFetch<Record<string, unknown>>(null, '/x');
    expect(out).toEqual({});
  });

  it('surfaces EchoApiError with HTTP status when body and statusText are blank (HTTP/2 5xx)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: '',
        url: 'http://test/api/v1/echo/dm/open',
        headers: { get: () => null },
        text: async () => '',
      }),
    );
    let captured: unknown;
    try {
      await echoFetch(null, '/dm/open');
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(EchoApiError);
    expect((captured as EchoApiError).status).toBe(503);
    expect((captured as Error).message).toBe(
      echoT('errors.api.serverUnavailable'),
    );
  });

  it('re-derives CSRF header on the post-401-refresh retry (token rotation)', async () => {
    /* First call returns the pre-refresh token, second call returns the rotated token. */
    let csrfCalls = 0;
    vi.spyOn(echoCsrf, 'echoCsrfHeaders').mockImplementation(() => {
      csrfCalls += 1;
      return { 'X-CSRF-Token': csrfCalls === 1 ? 'old-csrf' : 'new-csrf' };
    });

    vi.spyOn(authClient, 'authTryCookieRefresh').mockResolvedValue({
      id: 'u1',
      username: 'u',
      pfp: '',
    } as never);
    vi.spyOn(authSessionStore, 'useAuthSessionStore').mockReturnValue({
      applyRestoredProfile: vi.fn(),
      invalidateSessionForReauth: vi.fn(),
    } as never);

    const seenHeaders: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, init?: RequestInit) => {
        const h = init?.headers as Record<string, string>;
        seenHeaders.push({ ...h });
        if (seenHeaders.length === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            url: 'http://test/api/v1/echo/dm/open',
            headers: { get: () => null },
            text: async () =>
              JSON.stringify({ code: 'UNAUTHORIZED', message: 'no' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'http://test/api/v1/echo/dm/open',
          headers: { get: () => null },
          text: async () => JSON.stringify({ channelId: 'ch-after-refresh' }),
        });
      }),
    );

    const out = await echoFetch<{ channelId: string }>(null, '/dm/open', {
      method: 'POST',
      body: JSON.stringify({ peerUserId: 'p' }),
    });
    expect(out.channelId).toBe('ch-after-refresh');
    expect(seenHeaders).toHaveLength(2);
    expect(seenHeaders[0]?.['X-CSRF-Token']).toBe('old-csrf');
    expect(seenHeaders[1]?.['X-CSRF-Token']).toBe('new-csrf');
  });

  function bridgeWith401Fetch() {
    const state = { generation: 0 };
    const invalidateSessionForReauth = vi.fn();
    registerAuthSessionApiBridge({
      invalidateSessionForReauth,
      clearLocalTokens: () => {},
      getAuthStateGeneration: () => state.generation,
    });
    vi.spyOn(authClient, 'authTryCookieRefresh').mockResolvedValue(null);
    return { state, invalidateSessionForReauth };
  }

  function stub401Fetch(onFetch?: () => void) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        onFetch?.();
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          url: 'http://test/api/v1/echo/workspace',
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({ code: 'UNAUTHORIZED', message: 'no' }),
        };
      }),
    );
  }

  it('does not invalidate session on 401 when auth generation rotated mid-flight', async () => {
    const { state, invalidateSessionForReauth } = bridgeWith401Fetch();
    stub401Fetch(() => {
      state.generation += 1;
    });

    await expect(echoFetch(null, '/workspace')).rejects.toBeInstanceOf(
      EchoApiError,
    );
    expect(invalidateSessionForReauth).not.toHaveBeenCalled();
  });

  it('invalidates session on final 401 when auth generation is unchanged', async () => {
    const { invalidateSessionForReauth } = bridgeWith401Fetch();
    stub401Fetch();

    await expect(echoFetch(null, '/workspace')).rejects.toBeInstanceOf(
      EchoApiError,
    );
    expect(invalidateSessionForReauth).toHaveBeenCalledTimes(1);
  });
});
