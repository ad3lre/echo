import { createPinia, setActivePinia } from 'pinia';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import * as authClient from '@/api/authClient';
import { authenticatedApiFetch } from '@/api/authenticatedApiFetch';
import * as nativeAuth from '@/services/auth/nativeAuthToken';
import { useAuthSessionStore } from '@/stores/authSession';
import * as echoCsrf from '@/utils/echoCsrf';

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function callHeaders(fetchMock: Mock, index: number): Headers {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('authenticatedApiFetch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(authClient, 'authTryCookieRefresh').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends cookie credentials and native bearer headers', async () => {
    vi.spyOn(nativeAuth, 'nativeAuthRequestHeaders').mockReturnValue({
      'X-Echo-Client': 'ios',
      Authorization: 'Bearer native-token',
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await authenticatedApiFetch('https://api.example.test/api/v1/me/discord', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ credentials: 'include' }),
    );
    const headers = callHeaders(fetchMock, 0);
    expect(headers.get('X-Echo-Client')).toBe('ios');
    expect(headers.get('Authorization')).toBe('Bearer native-token');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('refreshes once on 401 and retries with fresh native auth and CSRF headers', async () => {
    const restoredUser = {
      id: 'u1',
      username: 'echo-user',
      pfp: '',
    };
    vi.mocked(authClient.authTryCookieRefresh).mockResolvedValue(
      restoredUser as never,
    );
    vi.spyOn(nativeAuth, 'nativeAuthRequestHeaders')
      .mockReturnValueOnce({
        'X-Echo-Client': 'ios',
        Authorization: 'Bearer old-token',
      })
      .mockReturnValueOnce({
        'X-Echo-Client': 'ios',
        Authorization: 'Bearer new-token',
      });
    vi.spyOn(echoCsrf, 'echoCsrfHeaders')
      .mockReturnValueOnce({ 'X-CSRF-Token': 'old-csrf' })
      .mockReturnValueOnce({ 'X-CSRF-Token': 'new-csrf' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          { code: 'UNAUTHORIZED', message: 'expired' },
          { status: 401, statusText: 'Unauthorized' },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const authSession = useAuthSessionStore();
    const applyRestoredProfile = vi.spyOn(
      authSession,
      'applyRestoredProfile',
    ) as Mock;

    await authenticatedApiFetch(
      'https://api.example.test/api/v1/me/youtube/stream-key',
      {
        method: 'PUT',
        headers: {
          ...echoCsrf.echoCsrfHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ streamKey: 'sk-test' }),
      },
    );

    expect(authClient.authTryCookieRefresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callHeaders(fetchMock, 0).get('Authorization')).toBe(
      'Bearer old-token',
    );
    expect(callHeaders(fetchMock, 0).get('X-CSRF-Token')).toBe('old-csrf');
    expect(callHeaders(fetchMock, 1).get('Authorization')).toBe(
      'Bearer new-token',
    );
    expect(callHeaders(fetchMock, 1).get('X-CSRF-Token')).toBe('new-csrf');
    expect(applyRestoredProfile).toHaveBeenCalledWith(restoredUser);
  });
});
