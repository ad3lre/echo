import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import type { RawMessage, UserForAuthor } from './useChatMessages';
import type { ChannelCategory } from './useChannels';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { messageWindowAuthority } from '@/services/realtime/messageWindowAuthority';

const echoClientMock = vi.hoisted(() => ({
  fetchEchoChannelMessageSearch: vi.fn(),
  fetchEchoServerMessageSearch: vi.fn(),
}));

const echoMessageSnapshotsMock = vi.hoisted(() => ({
  mapEchoMessageToRaw: vi.fn(),
}));

vi.mock('@/api/echoClient', () => echoClientMock);
vi.mock(
  '@/services/domain/echoMessageSnapshots',
  () => echoMessageSnapshotsMock,
);

vi.mock('@/features/chat/domain/channelMessageIndex', async () => {
  const { ref } = await import('vue');
  return {
    resolverVersion: ref(0),
    getChannelIndex: (_channelId: string, raw: readonly unknown[]) => ({
      sorted: ref([...raw]),
    }),
  };
});

import { useSearch } from './useSearch';

function bindSearchMessages(messages: Ref<Record<string, RawMessage[]>>) {
  messageWindowAuthority._resetForTesting();
  bindChannelMessageBuckets(messages as unknown as Ref<Record<string, any[]>>);
}

function flushPromises() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function u(id: string, name: string): UserForAuthor {
  return { id, name, pfp: '', status: 'online' };
}

function m(
  id: string,
  authorId: string,
  content: string,
  extra?: Partial<RawMessage>,
): RawMessage {
  return {
    id,
    authorId,
    timestamp: '2026-01-01T00:00:00.000Z',
    content,
    ...extra,
  };
}

function cats(
  entries: Array<{ id: string; name: string }>,
): Ref<ChannelCategory[]> {
  return ref<ChannelCategory[]>([
    {
      id: 'cat-1',
      name: 'Text',
      channels: entries.map((c) => ({ ...c, type: 'text' })),
    },
  ]);
}

function mapApiStubToRaw(x: unknown): RawMessage {
  const rec =
    typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {};
  return m(String(rec.id), 'u1', String(rec.content ?? ''));
}

describe('useSearch (client mode)', () => {
  it('filters by query + filter chips and strips trailing filter prefixes from query text', async () => {
    const categories = cats([
      { id: 'ch-general', name: 'general' },
      { id: 'ch-random', name: 'random' },
      { id: 'ch-empty', name: '' },
    ]);

    const messages = ref<Record<string, RawMessage[]>>({
      'ch-general': [
        m('g-1', 'u1', 'hello world https://example.com'),
        m('g-2', 'u2', 'hey @bob'),
        m('g-3', 'u1', ''),
        m('null-1', 'u1', 'x', { content: undefined as unknown as string }),
      ],
      'ch-random': [
        m('r-1', 'u1', 'hello in:'),
        m('r-2', 'u-missing', 'ignored'),
      ],
      'ch-empty': [m('e-1', 'u1', 'hello')],
    });

    const users = ref<UserForAuthor[]>([u('u1', 'Alice'), u('u2', 'Bob')]);
    bindSearchMessages(messages);
    const activeChannelId = ref('ch-general');
    const activeChannelMessages = ref([] as never[]);

    const s = useSearch(
      categories,
      activeChannelId,
      users,
      activeChannelMessages,
    );

    expect(s.searchScopeHint.value).toContain('message history loaded');
    expect(s.isSearchActive.value).toBe(false);
    expect(s.searchResultMessages.value).toEqual([]);

    s.searchText.value = 'hello in:';
    await nextTick();
    expect(s.isSearchActive.value).toBe(true);
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual([
      'g-1',
      'r-1',
      'e-1',
    ]);

    s.addFilter('in', 'general');
    await nextTick();
    expect(s.filterChips.value.map((c) => c.label)).toEqual(['in: #general']);
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['g-1']);

    s.addFilter('from', 'ali');
    await nextTick();
    expect(s.filterChips.value.map((c) => c.key)).toEqual(['in', 'from']);
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['g-1']);

    s.addFilter('mentions', '@bob');
    s.addFilter('hasType', 'link');
    await nextTick();
    expect(s.filterChips.value.map((c) => c.key)).toEqual([
      'in',
      'from',
      'mentions',
      'hasType',
    ]);
    expect(s.searchResultMessages.value).toEqual([]);

    s.removeFilter('mentions');
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['g-1']);

    s.clearSearch();
    await nextTick();

    s.searchText.value = 'ignored';
    await nextTick();
    expect(s.searchResultMessages.value[0]?.author.name).toBe('Unknown');

    s.clearSearch();
    await nextTick();
    expect(s.isSearchActive.value).toBe(false);
    expect(s.filterChips.value).toEqual([]);
    expect(s.searchResultPage.value).toBe(0);
  });

  it('canonicalizes typed inline filters into filter state', async () => {
    const categories = cats([
      { id: 'ch-general', name: 'general' },
      { id: 'ch-random', name: 'random' },
    ]);
    const messages = ref<Record<string, RawMessage[]>>({
      'ch-general': [m('g-1', 'u1', 'hello there')],
      'ch-random': [m('r-1', 'u1', 'hello there')],
    });

    bindSearchMessages(messages);
    const s = useSearch(
      categories,
      ref('ch-general'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
    );

    s.searchText.value = 'hello in:general';
    await nextTick();

    // Input text should not be overwritten while the user is typing an inline filter.
    // The controller should still update filter state correctly.
    expect(s.searchText.value).toBe('hello in:general');
    expect(s.filterChips.value.map((c) => c.label)).toEqual(['in: #general']);
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['g-1']);
  });

  it('supports hasType filters (image/gif/link/video/audio/docs) and paginates', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);
    const users = ref<UserForAuthor[]>([u('u1', 'Alice')]);

    const messages = ref<Record<string, RawMessage[]>>({
      ch1: [
        m('img-1', 'u1', 'pic', { imageUrl: 'https://cdn.site/a.png' }),
        m('gif-1', 'u1', 'gif', { gif: true, imageUrl: 'https://giphy.com/x' }),
        m('link-1', 'u1', 'see https://example.com and https://giphy.com/y'),
        m('vid-1', 'u1', 'watch', { videoUrl: 'https://cdn.site/v.mp4' }),
        m('aud-1', 'u1', 'listen', { audioUrl: 'https://cdn.site/a.mp3' }),
        m('doc-app', 'u1', 'file', {
          attachments: [
            {
              url: 'https://cdn.site/d.pdf',
              kind: 'image',
              mimeType: 'application/pdf',
            },
          ],
        }),
        m('doc-pdf', 'u1', 'file', {
          attachments: [
            {
              url: 'https://cdn.site/d2.bin',
              kind: 'image',
              mimeType: 'text/pdf',
            },
          ],
        }),
        m('doc-doc', 'u1', 'file', {
          attachments: [
            {
              url: 'https://cdn.site/d3.bin',
              kind: 'image',
              mimeType: 'text/document',
            },
          ],
        }),
        m('doc-none', 'u1', 'file', {
          attachments: [{ url: 'https://cdn.site/d4.bin', kind: 'image' }],
        }),
        ...Array.from({ length: 20 }, (_, i) =>
          m(`p-${i}`, 'u1', `page ${i} https://example.com/${i}`),
        ),
      ],
    });

    bindSearchMessages(messages);
    const s = useSearch(categories, ref('ch1'), users, ref([] as never[]));

    s.addFilter('hasType', 'image');
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['img-1']);

    s.addFilter('hasType', 'gif');
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['gif-1']);

    s.addFilter('hasType', 'link');
    await nextTick();
    expect(s.searchResultMessages.value.some((x) => x.id === 'link-1')).toBe(
      true,
    );

    s.addFilter('hasType', 'video');
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['vid-1']);

    s.addFilter('hasType', 'audio');
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['aud-1']);

    s.addFilter('hasType', 'docs');
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual([
      'doc-app',
      'doc-doc',
      'doc-pdf',
    ]);

    // Default branch in `messageMatchesHasType`.
    s.addFilter('hasType', 'nope' as never);
    await nextTick();
    expect(s.searchResultMessages.value).toEqual([]);

    s.clearSearch();
    s.searchText.value = 'page';
    await nextTick();
    expect(s.totalPages.value).toBe(2);
    expect(s.paginatedSearchResults.value).toHaveLength(16);
    s.goToSearchPage(999);
    await nextTick();
    expect(s.searchResultPage.value).toBe(1);
    expect(s.paginatedSearchResults.value).toHaveLength(4);
    s.goToSearchPage(-1);
    await nextTick();
    expect(s.searchResultPage.value).toBe(0);
  });

  it('labels channelName for DM variants when searching client-side', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);
    const users = ref<UserForAuthor[]>([u('u2', 'Bob')]);
    const messages = ref<Record<string, RawMessage[]>>({
      'dm-u2': [m('dm-1', 'u2', 'hello')],
      'dm-u404': [m('dm-404-1', 'u404', 'hello')],
      'dm-group-1': [m('gdm-1', 'u2', 'hello')],
      '100000000000000': [m('echo-dm-1', 'u2', 'hello')],
    });

    bindSearchMessages(messages);
    const apiMode = {
      authToken: ref<string | undefined | null>('t'),
      // Keep API search disabled so `searchResultMessages` uses client filtering,
      // but still exercise the DM-thread naming branch in `allServerMessages`.
      echoSessionReady: ref(false),
      selectedServerId: ref<string | undefined | null>(null),
      isInDMMode: ref(true),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set(['100000000000000'])),
    };

    const activeChannelId = ref('dm-u2');
    const s = useSearch(
      categories,
      activeChannelId,
      users,
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'hello';
    await nextTick();
    expect(s.searchResultMessages.value[0]?.channelName).toBe('Bob');

    activeChannelId.value = 'dm-u404';
    await nextTick();
    expect(s.searchResultMessages.value[0]?.channelName).toBe('DM');

    activeChannelId.value = 'dm-group-1';
    await nextTick();
    expect(s.searchResultMessages.value[0]?.channelName).toBe('Group DM');

    // Echo graph DM thread id in `echoDmThreadIds` uses "Direct message".
    activeChannelId.value = '100000000000000';
    await nextTick();
    expect(s.searchResultMessages.value[0]?.channelName).toBe('Direct message');
    expect(s.searchScopeHint.value).toContain('message history loaded');
  });
});

describe('useSearch (API mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bindSearchMessages(ref<Record<string, RawMessage[]>>({}));
    echoClientMock.fetchEchoChannelMessageSearch.mockReset();
    echoClientMock.fetchEchoServerMessageSearch.mockReset();
    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces API calls, canonicalizes inline filters, and builds query params', async () => {
    const categories = cats([
      { id: 'ch1', name: 'general' },
      { id: 'ch2', name: 'random' },
    ]);

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );
    echoClientMock.fetchEchoServerMessageSearch.mockResolvedValue({
      messages: [{ id: 's-1', channelId: 'ch1', content: 'hello' }],
    });

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    // Exercise debounce clearTimeout path.
    s.searchText.value = 'h';
    await nextTick();
    s.searchText.value = 'hello in:#general from:@ali mentions:@bob has:image';
    await nextTick();
    expect(s.filterChips.value.map((c) => c.key)).toEqual([
      'in',
      'from',
      'mentions',
      'hasType',
    ]);

    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(echoClientMock.fetchEchoServerMessageSearch).toHaveBeenCalledTimes(
      1,
    );
    expect(echoClientMock.fetchEchoServerMessageSearch).toHaveBeenCalledWith(
      'token-1',
      'srv-1',
      expect.objectContaining({
        q: 'hello',
        channelId: 'ch1',
        authorId: 'u1',
        mentions: 'bob',
        hasType: 'image',
        limit: expect.any(Number),
      }),
    );

    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['s-1']);
    expect(s.paginatedSearchResults.value.map((x) => x.id)).toEqual(['s-1']);
    expect(s.totalPages.value).toBe(1);
    expect(s.searchScopeHint.value).toContain('server');
  });

  it('does not schedule API search when criteria are not satisfied', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);
    echoClientMock.fetchEchoServerMessageSearch.mockResolvedValue({
      messages: [],
    });

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.addFilter('from', 'no-match');
    await nextTick();

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(echoClientMock.fetchEchoServerMessageSearch).not.toHaveBeenCalled();
    expect(s.searchResultMessages.value).toEqual([]);
    expect(s.searchError.value).toBe(null);
  });

  it('ignores stale API results after search is cleared', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );

    const pendingSearch = deferred<{
      messages: { id: string; channelId: string; content: string }[];
    }>();
    echoClientMock.fetchEchoServerMessageSearch.mockImplementation(
      () => pendingSearch.promise,
    );

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'hello';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();

    s.clearSearch();
    await nextTick();

    pendingSearch.resolve({
      messages: [{ id: 'stale-1', channelId: 'ch1', content: 'hello' }],
    });
    await flushPromises();
    await nextTick();

    expect(s.isSearchActive.value).toBe(false);
    expect(s.searchResultMessages.value).toEqual([]);
    expect(s.searchLoading.value).toBe(false);
  });

  it('bails out early when criteria are not satisfied at run time (no fetch)', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);
    echoClientMock.fetchEchoServerMessageSearch.mockResolvedValue({
      messages: [],
    });

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    // Schedule a debounced run, then invalidate the criteria while keeping search active.
    s.searchText.value = 'x';
    await nextTick();
    s.searchText.value = '';
    s.addFilter('from', 'no-match');
    await nextTick();

    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(echoClientMock.fetchEchoServerMessageSearch).not.toHaveBeenCalled();
    expect(s.searchResultMessages.value).toEqual([]);
    expect(s.searchError.value).toBe(null);
  });

  it('omits `q` when searching by author only', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );
    echoClientMock.fetchEchoServerMessageSearch.mockResolvedValue({
      messages: [{ id: 's-1', channelId: 'ch1', content: 'hello' }],
    });

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = '';
    s.addFilter('from', 'ali');
    await nextTick();

    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(echoClientMock.fetchEchoServerMessageSearch).toHaveBeenCalledTimes(
      1,
    );
    expect(echoClientMock.fetchEchoServerMessageSearch).toHaveBeenCalledWith(
      'token-1',
      'srv-1',
      expect.not.objectContaining({ q: expect.anything() }),
    );
  });

  it('no-ops if API mode becomes inactive before the debounced search runs', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'hello';
    await nextTick();

    apiMode.echoSessionReady.value = false;
    await nextTick();

    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(echoClientMock.fetchEchoServerMessageSearch).not.toHaveBeenCalled();
    expect(s.useApiSearch.value).toBe(false);
  });

  it('ignores stale API responses and stale errors (request sequencing)', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );

    let resolveFirst: ((v: unknown) => void) | undefined;
    const first = new Promise((resolve, reject) => {
      resolveFirst = resolve;
      void reject;
    });

    echoClientMock.fetchEchoServerMessageSearch
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        messages: [{ id: 'new', channelId: 'ch1', content: 'new' }],
      });

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'old';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();

    s.searchText.value = 'new';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['new']);

    resolveFirst?.({
      messages: [{ id: 'old', channelId: 'ch1', content: 'old' }],
    });
    await flushPromises();
    await nextTick();
    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['new']);
  });

  it('ignores stale API errors (request sequencing)', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );

    let rejectFirst: ((e: unknown) => void) | undefined;
    const first = new Promise((resolve, reject) => {
      void resolve;
      rejectFirst = reject;
    });

    echoClientMock.fetchEchoServerMessageSearch
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        messages: [{ id: 'new', channelId: 'ch1', content: 'new' }],
      });

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'old';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();

    s.searchText.value = 'new';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(s.searchResultMessages.value.map((x) => x.id)).toEqual(['new']);

    rejectFirst?.(new Error('stale'));
    await flushPromises();
    await nextTick();
    expect(s.searchError.value).not.toBe('stale');
  });

  it('paginates API results, fetches additional batches, and surfaces errors', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    const apiMode = {
      authToken: ref<string | undefined | null>('token-1'),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('srv-1'),
      isInDMMode: ref(false),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set()),
    };

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );

    // First call returns a full batch so `apiExhausted` stays false.
    echoClientMock.fetchEchoServerMessageSearch.mockResolvedValueOnce({
      messages: Array.from({ length: 24 }, (_, i) => ({
        id: `s-${i}`,
        channelId: 'ch1',
        content: `row ${i}`,
      })),
    });

    // Second call returns short batch so we mark exhausted.
    echoClientMock.fetchEchoServerMessageSearch.mockResolvedValueOnce({
      messages: [{ id: 's-next', channelId: 'ch1', content: 'next' }],
    });

    const s = useSearch(
      categories,
      ref('ch1'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'row';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(s.searchResultMessages.value).toHaveLength(24);
    expect(s.paginatedSearchResults.value).toHaveLength(16);
    expect(s.totalPages.value).toBeGreaterThanOrEqual(2);

    s.goToSearchPage(1);
    await nextTick();
    await flushPromises();
    await nextTick();

    expect(echoClientMock.fetchEchoServerMessageSearch).toHaveBeenCalledTimes(
      2,
    );
    expect(
      echoClientMock.fetchEchoServerMessageSearch,
    ).toHaveBeenLastCalledWith(
      'token-1',
      'srv-1',
      expect.objectContaining({
        before: 's-23',
      }),
    );
    expect(s.searchResultMessages.value.map((x) => x.id)).toContain('s-next');

    // Error path (non-Error becomes "Search failed").
    echoClientMock.fetchEchoServerMessageSearch.mockRejectedValueOnce('nope');
    s.searchText.value = 'boom';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();
    expect(s.searchError.value).toBe('Search failed');

    // Error instance surfaces message.
    echoClientMock.fetchEchoServerMessageSearch.mockRejectedValueOnce(
      new Error('boom'),
    );
    s.searchText.value = 'boom2';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();
    expect(s.searchError.value).toBe('boom');

    // Switching out of API mode clears API state.
    apiMode.echoSessionReady.value = false;
    await nextTick();
    expect(s.useApiSearch.value).toBe(false);
    expect(s.searchLoading.value).toBe(false);
    expect(s.searchScopeHint.value).toContain('message history loaded');
  });

  it('uses channel search API when activeChannelId is an Echo DM thread id', async () => {
    const categories = cats([{ id: 'ch1', name: 'general' }]);

    echoMessageSnapshotsMock.mapEchoMessageToRaw.mockImplementation(
      mapApiStubToRaw,
    );
    echoClientMock.fetchEchoChannelMessageSearch.mockResolvedValue({
      messages: [{ id: 'dm-1', channelId: '100000000000000', content: 'hi' }],
    });

    const apiMode = {
      authToken: ref<string | undefined | null>(null),
      echoSessionReady: ref(true),
      selectedServerId: ref<string | undefined | null>('echo'),
      isInDMMode: ref(true),
      echoDmThreadIds: ref<ReadonlySet<string>>(new Set(['100000000000000'])),
    };

    const s = useSearch(
      categories,
      ref('100000000000000'),
      ref<UserForAuthor[]>([u('u1', 'Alice')]),
      ref([] as never[]),
      apiMode,
    );

    s.searchText.value = 'hi';
    await nextTick();
    vi.advanceTimersByTime(320);
    await flushPromises();
    await nextTick();

    expect(echoClientMock.fetchEchoChannelMessageSearch).toHaveBeenCalledTimes(
      1,
    );
    expect(echoClientMock.fetchEchoServerMessageSearch).not.toHaveBeenCalled();
    expect(s.searchScopeHint.value).toContain('DM thread');
  });
});
