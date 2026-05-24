import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type * as EchoDmCommandFacade from '@/features/dm/echoDmCommandFacade';
import { useAppLayoutOpenDmThread } from './useAppLayoutOpenDmThread';
import { openEchoDirectDmChannel } from '@/features/dm/echoDmCommandFacade';
import type { DmSubView } from '@/features/layout/mainSurface';
import type { MessageRequestEntry } from '@/composables/workspace/types';

vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: {
    isMockDataMode: false,
    restoreSessionOnAppStart: true,
    seedDemoServersInServerStore: false,
  },
}));

vi.mock('@/features/dm/echoDmCommandFacade', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoDmCommandFacade>();
  return {
    ...actual,
    openEchoDirectDmChannel: vi.fn(),
  };
});

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('useAppLayoutOpenDmThread', () => {
  beforeEach(() => {
    vi.mocked(openEchoDirectDmChannel).mockReset();
  });

  it('does not let a slower postEchoOpenDm overwrite channel after selecting another user', async () => {
    let finishA!: (value: string) => void;
    const slowA = new Promise<string>((resolve) => {
      finishA = resolve;
    });

    vi.mocked(openEchoDirectDmChannel).mockImplementation((_token, userId) => {
      if (userId === userA) return slowA;
      return Promise.resolve('ch-b');
    });

    const selectedDMUserId = ref<string | null>(null);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('start');
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const echoDmThreadIds = ref(new Set<string>());

    const serverStore = { selectServer: vi.fn() };
    const authSession = {
      accessToken: 'token',
      isAuthenticated: true,
    };

    const { onSelectDmUser } = useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore: serverStore as never,
      pfpBarExpanded,
      authSession: authSession as never,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
    });

    void onSelectDmUser(userA);
    await nextTick();
    void onSelectDmUser(userB);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeChannelId.value).toBe('ch-b');
    expect(selectedDMUserId.value).toBe(userB);

    finishA('ch-a');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeChannelId.value).toBe('ch-b');
    expect(echoDmPeerByChannelId.value.get('ch-a')).toBeUndefined();
    expect(echoDmPeerByChannelId.value.get('ch-b')).toBe(userB);
  });

  it('moves message-request history into resolved DM thread channel', async () => {
    vi.mocked(openEchoDirectDmChannel).mockResolvedValue('ch-friend');

    const selectedDMUserId = ref<string | null>(null);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('mr-channel');
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const echoDmThreadIds = ref(new Set<string>());
    const messageRequests = ref<MessageRequestEntry[]>([
      {
        id: 'mr-1',
        channelId: 'mr-channel',
        fromUserId: userA,
        preview: 'hello',
      },
    ]);
    const messages = ref<
      Record<string, Array<{ id?: string; content: string }>>
    >({
      'mr-channel': [{ id: 'm-1', content: 'before friendship' }],
    });

    const serverStore = { selectServer: vi.fn() };
    const authSession = {
      accessToken: 'token',
      isAuthenticated: true,
    };

    const { onSelectDmUser } = useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore: serverStore as never,
      pfpBarExpanded,
      authSession: authSession as never,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
      messages: messages as never,
      messageRequests,
    });

    await onSelectDmUser(userA);

    expect(activeChannelId.value).toBe('ch-friend');
    expect(messages.value['mr-channel']).toBeUndefined();
    expect(messages.value['ch-friend']?.map((m) => m.id)).toEqual(['m-1']);
  });

  it('moves prior peer-thread history when backend returns a new channel id', async () => {
    vi.mocked(openEchoDirectDmChannel).mockResolvedValue('ch-friend-new');

    const selectedDMUserId = ref<string | null>(null);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('old-peer-channel');
    const echoDmPeerByChannelId = ref(
      new Map<string, string>([['old-peer-channel', userA]]),
    );
    const echoDmThreadIds = ref(new Set<string>());
    const messages = ref<
      Record<string, Array<{ id?: string; content: string }>>
    >({
      'old-peer-channel': [{ id: 'm-old-1', content: 'pre-friend history' }],
    });

    const serverStore = { selectServer: vi.fn() };
    const authSession = {
      accessToken: 'token',
      isAuthenticated: true,
    };

    const { onSelectDmUser } = useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore: serverStore as never,
      pfpBarExpanded,
      authSession: authSession as never,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
      messages: messages as never,
      messageRequests: ref<MessageRequestEntry[]>([]),
    });

    await onSelectDmUser(userA);

    expect(activeChannelId.value).toBe('ch-friend-new');
    expect(messages.value['old-peer-channel']).toBeUndefined();
    expect(messages.value['ch-friend-new']?.map((m) => m.id)).toEqual([
      'm-old-1',
    ]);
  });

  it('activates persisted peer channel instead of dm shell while open resolves', async () => {
    vi.mocked(openEchoDirectDmChannel).mockImplementation(
      () =>
        new Promise(() => {
          /* never settles */
        }),
    );

    const selectedDMUserId = ref<string | null>(null);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('start');
    const echoDmPeerByChannelId = ref(
      new Map<string, string>([['existing-ch', userA]]),
    );
    const echoDmThreadIds = ref(new Set<string>(['existing-ch']));

    const serverStore = { selectServer: vi.fn() };
    const authSession = {
      accessToken: 'token',
      isAuthenticated: true,
    };

    const { onSelectDmUser } = useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore: serverStore as never,
      pfpBarExpanded,
      authSession: authSession as never,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
    });

    void onSelectDmUser(userA);
    await nextTick();

    expect(activeChannelId.value).toBe('existing-ch');
  });

  it('tracks in-flight dm thread opening for loading UX', async () => {
    let finish!: (value: string) => void;
    vi.mocked(openEchoDirectDmChannel).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const selectedDMUserId = ref<string | null>(null);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('start');
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const echoDmThreadIds = ref(new Set<string>());

    const serverStore = { selectServer: vi.fn() };
    const authSession = {
      accessToken: 'token',
      isAuthenticated: true,
    };

    const { onSelectDmUser, isOpeningDmThread } = useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore: serverStore as never,
      pfpBarExpanded,
      authSession: authSession as never,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
    });

    const openPromise = onSelectDmUser(userA);
    await nextTick();
    expect(isOpeningDmThread.value).toBe(true);

    finish('dm-a');
    await openPromise;
    await flushMicrotasks();
    expect(isOpeningDmThread.value).toBe(false);
  });

  it('keeps dm shell selected when openDm request fails', async () => {
    vi.mocked(openEchoDirectDmChannel).mockRejectedValue(
      new Error('network down'),
    );

    const selectedDMUserId = ref<string | null>(null);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('1492135186257805312');
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const echoDmThreadIds = ref(new Set<string>());

    const serverStore = { selectServer: vi.fn() };
    const authSession = {
      accessToken: 'token',
      isAuthenticated: true,
    };

    const { onSelectDmUser } = useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore: serverStore as never,
      pfpBarExpanded,
      authSession: authSession as never,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
    });

    await onSelectDmUser(userA);
    await flushMicrotasks();

    expect(selectedDMUserId.value).toBe(userA);
    expect(activeChannelId.value).toBe(`dm-${userA}`);
  });
});
