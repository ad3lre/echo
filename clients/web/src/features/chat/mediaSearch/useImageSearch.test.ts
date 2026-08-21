// @vitest-environment happy-dom

import { createApp, defineComponent } from 'vue';
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
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useImageSearch } from '@/features/chat/mediaSearch/useImageSearch';

type ImageSearchApi = ReturnType<typeof useImageSearch>;

function imageSearchResponse(
  body: Record<string, unknown>,
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function pagePayload(url = 'https://cdn.example.test/cat.jpg') {
  return {
    results: [
      {
        id: 'img-1',
        url,
        thumbUrl: url,
        alt: 'Cat',
      },
    ],
    page: 1,
    pageSize: 10,
    maxPage: 10,
    hasMore: false,
  };
}

function mountUseImageSearch(): {
  api: ImageSearchApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  unmount: () => void;
} {
  const pinia = createPinia();
  setActivePinia(pinia);
  let api: ImageSearchApi | null = null;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(
    defineComponent({
      setup() {
        api = useImageSearch();
        return () => null;
      },
    }),
  );
  app.use(pinia);
  app.mount(host);
  if (!api) throw new Error('useImageSearch did not mount');
  return {
    api,
    authSession: useAuthSessionStore(),
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe('useImageSearch', () => {
  beforeEach(() => {
    vi.spyOn(authClient, 'authTryCookieRefresh').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends cookie credentials to the authenticated image search route', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageSearchResponse(pagePayload()));
    vi.stubGlobal('fetch', fetchMock);

    const mounted = mountUseImageSearch();
    try {
      await mounted.api.search('cats');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('/api/v1/image-search?q=cats&page=1');
      expect(init).toEqual(expect.objectContaining({ credentials: 'include' }));
      expect(mounted.api.images.value).toHaveLength(1);
    } finally {
      mounted.unmount();
    }
  });

  it('refreshes auth once on 401 and retries the request', async () => {
    const restoredUser = {
      id: 'u1',
      username: 'echo-user',
      pfp: '',
    };
    vi.mocked(authClient.authTryCookieRefresh).mockResolvedValue(
      restoredUser as never,
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        imageSearchResponse(
          { code: 'UNAUTHORIZED', message: 'expired' },
          { status: 401, statusText: 'Unauthorized' },
        ),
      )
      .mockResolvedValueOnce(
        imageSearchResponse(pagePayload('https://cdn.example.test/retry.jpg')),
      );
    vi.stubGlobal('fetch', fetchMock);

    const mounted = mountUseImageSearch();
    const applyRestoredProfile = vi.spyOn(
      mounted.authSession,
      'applyRestoredProfile',
    ) as Mock;
    try {
      await mounted.api.search('retry-token-case');
      expect(authClient.authTryCookieRefresh).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ credentials: 'include' }),
      );
      expect(fetchMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({ credentials: 'include' }),
      );
      expect(applyRestoredProfile).toHaveBeenCalledWith(restoredUser);
      expect(mounted.api.images.value[0]?.url).toBe(
        'https://cdn.example.test/retry.jpg',
      );
    } finally {
      mounted.unmount();
    }
  });
});
