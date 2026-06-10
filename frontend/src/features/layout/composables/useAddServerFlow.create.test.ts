import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed, ref } from 'vue';
import { useAddServerFlow } from './useAddServerFlow';

vi.mock('@/services/realtime/channelMessageAuthority', () => ({
  ensureChannelBucket: vi.fn(() => []),
}));

vi.mock('@/api/echoClient', () => ({
  createEchoServer: vi.fn(),
  patchEchoServerPreferences: vi.fn(),
  postEchoDiscordImportPostSetup: vi.fn(),
  postEchoDiscordImportRunFull: vi.fn(),
  postEchoJoinDirectoryServer: vi.fn(),
  postEchoJoinWithInviteToken: vi.fn(),
  uploadServerBrandingFile: vi.fn(),
}));

vi.mock('@/utils/uiErrorBus', () => ({
  UIErrorBus: { emit: vi.fn() },
}));

vi.mock('@/utils/controllerMissingAction', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/controllerMissingAction')>();
  return {
    ...actual,
    dispatchAppToastDetail: vi.fn(),
  };
});

import { createEchoServer, uploadServerBrandingFile } from '@/api/echoClient';
import { iconEchoRounded } from '@/assets/branding';

function buildFlow() {
  const selectedServerId = ref<string | null>(null);
  const serverStore = {
    servers: [] as Array<{ id: string; name: string; imageUrl: string }>,
    selectedServerId: selectedServerId.value,
    selectServer: vi.fn((id: string) => {
      selectedServerId.value = id;
      serverStore.selectedServerId = id;
    }),
    updateServerImageUrl: vi.fn(),
  };
  const workspace = {
    categoriesByServer: ref<
      Record<
        string,
        { name: string; channels: { id: string; type: string }[] }[]
      >
    >({}),
    discoverableServers: ref([]),
    servers: ref([] as Array<{ id: string; name: string; imageUrl: string }>),
    serverMemberIds: ref<Record<string, string[]>>({}),
    users: ref([]),
    friendIds: ref([]),
    refreshExploreDirectory: vi.fn().mockResolvedValue(undefined),
  };
  const isAddServerModalOpen = ref(true);
  const hydrateWorkspace = vi.fn().mockResolvedValue(undefined);

  const flow = useAddServerFlow({
    serverStore: serverStore as never,
    authSession: {
      isAuthenticated: true,
      accessToken: 'tok',
      backendUser: { id: 'u1' },
    } as never,
    workspace: workspace as never,
    currentUser: computed(() => ({ id: 'u1' })),
    activeChannelId: ref(''),
    activeRailTab: ref('servers'),
    dmActiveTab: ref('friends'),
    isAddServerModalOpen,
    addServerInitialView: ref('create'),
    isMoreServersPanelOpen: ref(false),
    isMoreServersPinned: ref(false),
    newlyCreatedServerId: ref<string | null>(null),
    getFirstTextChannelId: () => 'ch-general',
    hydrateWorkspace,
    sendMessage: vi.fn(),
    inviteLinkForServer: computed(() => ''),
    selectedServer: computed(() => undefined),
    isExploreView: false,
    requestJoinServerConfirm: vi.fn().mockResolvedValue(true),
    finishJoinServerConfirmModal: vi.fn(),
    requestServerApplicationModal: vi.fn().mockResolvedValue('cancelled'),
    finishServerApplicationModal: vi.fn(),
  });

  return {
    flow,
    serverStore,
    workspace,
    isAddServerModalOpen,
    hydrateWorkspace,
    activeChannelId: flow as never,
  };
}

describe('useAddServerFlow create server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('patches workspace and navigates before hydrate finishes', async () => {
    vi.mocked(createEchoServer).mockResolvedValueOnce({
      serverId: 'srv-new',
      defaultChannelId: 'ch-general',
    });
    let resolveHydrate!: () => void;
    const hydrateGate = new Promise<void>((resolve) => {
      resolveHydrate = resolve;
    });
    const ctx = buildFlow();
    ctx.hydrateWorkspace.mockImplementation(() => hydrateGate);

    const activeChannelId = ref('');
    const flow = useAddServerFlow({
      serverStore: ctx.serverStore as never,
      authSession: {
        isAuthenticated: true,
        accessToken: 'tok',
        backendUser: { id: 'u1' },
      } as never,
      workspace: ctx.workspace as never,
      currentUser: computed(() => ({ id: 'u1' })),
      activeChannelId,
      activeRailTab: ref('servers'),
      dmActiveTab: ref('friends'),
      isAddServerModalOpen: ctx.isAddServerModalOpen,
      addServerInitialView: ref('create'),
      isMoreServersPanelOpen: ref(false),
      isMoreServersPinned: ref(false),
      newlyCreatedServerId: ref<string | null>(null),
      getFirstTextChannelId: () => 'ch-general',
      hydrateWorkspace: ctx.hydrateWorkspace,
      sendMessage: vi.fn(),
      inviteLinkForServer: computed(() => ''),
      selectedServer: computed(() => undefined),
      isExploreView: false,
      requestJoinServerConfirm: vi.fn().mockResolvedValue(true),
      finishJoinServerConfirmModal: vi.fn(),
      requestServerApplicationModal: vi.fn().mockResolvedValue('cancelled'),
      finishServerApplicationModal: vi.fn(),
    });

    const createPromise = flow.handleCreateServer({ name: 'Test Guild' });

    await vi.waitFor(() => {
      expect(ctx.isAddServerModalOpen.value).toBe(false);
      expect(ctx.serverStore.selectServer).toHaveBeenCalledWith('srv-new');
    });

    expect(flow.addServerCreateBusy.value).toBe(false);
    expect(activeChannelId.value).toBe('ch-general');
    expect(ctx.workspace.servers.value).toEqual([
      {
        id: 'srv-new',
        name: 'Test Guild',
        imageUrl: iconEchoRounded,
        ownerId: 'u1',
      },
    ]);
    expect(ctx.workspace.categoriesByServer.value['srv-new']).toBeDefined();
    expect(ctx.hydrateWorkspace).toHaveBeenCalled();
    expect(createPromise).toBeInstanceOf(Promise);

    resolveHydrate();
    await createPromise;
  });

  it('shows the picked icon file optimistically before upload finishes', async () => {
    vi.mocked(createEchoServer).mockResolvedValueOnce({
      serverId: 'srv-icon',
      defaultChannelId: 'ch-general',
    });
    vi.mocked(uploadServerBrandingFile).mockImplementation(
      () => new Promise(() => {}),
    );
    const ctx = buildFlow();
    const iconFile = new File(['icon-bytes'], 'guild.png', {
      type: 'image/png',
    });
    const createPromise = ctx.flow.handleCreateServer({
      name: 'Icon Guild',
      iconFile,
    });

    await vi.waitFor(() => {
      expect(ctx.isAddServerModalOpen.value).toBe(false);
    });

    const row = ctx.workspace.servers.value.find((s) => s.id === 'srv-icon');
    expect(row?.imageUrl).toMatch(/^blob:/);
    expect(row?.imageUrl).not.toBe(iconEchoRounded);

    await createPromise;
  });

  it('surfaces create API errors and leaves workspace unchanged', async () => {
    vi.mocked(createEchoServer).mockRejectedValueOnce(new Error('Plan limit'));
    const ctx = buildFlow();
    const flow = useAddServerFlow({
      serverStore: ctx.serverStore as never,
      authSession: {
        isAuthenticated: true,
        accessToken: 'tok',
        backendUser: { id: 'u1' },
      } as never,
      workspace: ctx.workspace as never,
      currentUser: computed(() => ({ id: 'u1' })),
      activeChannelId: ref(''),
      activeRailTab: ref('servers'),
      dmActiveTab: ref('friends'),
      isAddServerModalOpen: ctx.isAddServerModalOpen,
      addServerInitialView: ref('create'),
      isMoreServersPanelOpen: ref(false),
      isMoreServersPinned: ref(false),
      newlyCreatedServerId: ref<string | null>(null),
      getFirstTextChannelId: () => '',
      hydrateWorkspace: ctx.hydrateWorkspace,
      sendMessage: vi.fn(),
      inviteLinkForServer: computed(() => ''),
      selectedServer: computed(() => undefined),
      isExploreView: false,
      requestJoinServerConfirm: vi.fn().mockResolvedValue(true),
      finishJoinServerConfirmModal: vi.fn(),
      requestServerApplicationModal: vi.fn().mockResolvedValue('cancelled'),
      finishServerApplicationModal: vi.fn(),
    });

    await flow.handleCreateServer({ name: 'Fail Guild' });

    expect(flow.addServerJoinError.value).toBe('Plan limit');
    expect(ctx.workspace.servers.value).toEqual([]);
    expect(ctx.isAddServerModalOpen.value).toBe(true);
    expect(ctx.hydrateWorkspace).not.toHaveBeenCalled();
  });
});
