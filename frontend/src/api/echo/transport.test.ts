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

  it('uses HTTP status when body has no message/code (HTTP/2 statusText empty)', () => {
    const err = new EchoApiError(503, { code: 'UNKNOWN', message: '' });
    expect(err.message).toBe('HTTP 503');
  });

  it('uses HTTP status when code is missing entirely', () => {
    const err = new EchoApiError(502, {
      code: '',
      message: '',
    } as unknown as { code: string; message: string });
    expect(err.message).toBe('HTTP 502');
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

  it('appends detail when present', () => {
    const err = new EchoApiError(400, {
      code: 'INVALID_BODY',
      message: 'Bad input',
      detail: 'peerUserId required',
    });
    expect(err.message).toBe('Invalid request. (peerUserId required)');
  });
});

describe('echoFetch', () => {
  beforeEach(() => {
    vi.spyOn(echoMode, 'assertEchoApiAllowed').mockImplementation(() => {});
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
    expect((captured as Error).message).toBe('HTTP 503');
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
});
