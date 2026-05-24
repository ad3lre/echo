import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed, ref } from 'vue';
import { useAddServerFlow } from './useAddServerFlow';

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
  UIErrorBus: {
    emit: vi.fn(),
  },
}));

const dispatchAppToastDetail = vi.hoisted(() => vi.fn());

const mockRequestGuestExploreJoinBlockedModal = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock('@/utils/guestJoinExploreBlockedDialog', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/utils/guestJoinExploreBlockedDialog')
    >();
  return {
    ...actual,
    requestGuestExploreJoinBlockedModal:
      mockRequestGuestExploreJoinBlockedModal,
  };
});

vi.mock('@/utils/controllerMissingAction', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/controllerMissingAction')>();
  return {
    ...actual,
    dispatchAppToastDetail,
  };
});

import {
  postEchoJoinDirectoryServer,
  postEchoJoinWithInviteToken,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';
import { UIErrorBus } from '@/utils/uiErrorBus';

function buildFlow(isModalOpen: boolean) {
  const selectedServerId = ref<string | null>(null);
  const serverStore = {
    servers: [] as Array<{ id: string }>,
    selectedServerId: selectedServerId.value,
    selectServer: vi.fn((id: string) => {
      selectedServerId.value = id;
      serverStore.selectedServerId = id;
    }),
  };
  const workspace = {
    categoriesByServer: ref<
      Record<
        string,
        { name: string; channels: { id: string; type: string }[] }[]
      >
    >({}),
    discoverableServers: ref(
      [] as Array<{ id?: string; name: string; pfp: string }>,
    ),
    servers: ref([] as Array<{ id: string; name: string; imageUrl: string }>),
    serverMemberIds: ref<Record<string, string[]>>({}),
    users: ref([] as Array<{ id: string; name: string; pfp: string }>),
    friendIds: ref([] as string[]),
    refreshExploreDirectory: vi.fn().mockResolvedValue(undefined),
  };
  const authSession = {
    isAuthenticated: true,
    accessToken: '',
  };

  return useAddServerFlow({
    serverStore: serverStore as never,
    authSession: authSession as never,
    workspace: workspace as never,
    currentUser: computed(() => ({ id: 'u1' })),
    activeChannelId: ref(''),
    activeRailTab: ref('servers'),
    dmActiveTab: ref('friends'),
    isAddServerModalOpen: ref(isModalOpen),
    addServerInitialView: ref('initial'),
    isMoreServersPanelOpen: ref(false),
    isMoreServersPinned: ref(false),
    newlyCreatedServerId: ref<string | null>(null),
    getFirstTextChannelId: () => '',
    hydrateWorkspace: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    inviteLinkForServer: computed(() => ''),
    selectedServer: computed(() => ({ name: 'Server' })),
    isExploreView: false,
    requestJoinServerConfirm: vi.fn().mockResolvedValue(true),
    finishJoinServerConfirmModal: vi.fn(),
    requestServerApplicationModal: vi.fn().mockResolvedValue('cancelled'),
    finishServerApplicationModal: vi.fn(),
  });
}

describe('useAddServerFlow join feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchAppToastDetail.mockClear();
  });

  it('shows join denial inside Add Server modal', async () => {
    vi.mocked(postEchoJoinWithInviteToken).mockRejectedValueOnce(
      new Error('You are banned from this server'),
    );
    const flow = buildFlow(true);

    await flow.handleJoinWithInviteLink('abc');

    expect(flow.addServerJoinError.value).toBe(
      'You are banned from this server.',
    );
    expect(UIErrorBus.emit).not.toHaveBeenCalled();
    expect(dispatchAppToastDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'You are banned from this server.',
        severity: 'error',
      }),
    );
  });

  it('emits global UI banner when join denial occurs outside modal', async () => {
    vi.mocked(postEchoJoinWithInviteToken).mockRejectedValueOnce(
      new Error('This server is not joinable from Explore'),
    );
    const flow = buildFlow(false);

    await flow.handleJoinWithInviteLink('abc');

    expect(flow.addServerJoinError.value).toBe(
      'This server is not joinable from Explore',
    );
    expect(UIErrorBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'invite_join',
        severity: 'error',
        userMessage: 'This server is not joinable from Explore',
      }),
    );
  });

  it('shows modal for Explore join blocked by account status (UPGRADE_REQUIRED)', async () => {
    vi.mocked(postEchoJoinDirectoryServer).mockRejectedValueOnce(
      new EchoApiError(403, {
        code: 'UPGRADE_REQUIRED',
        message:
          'Create an account with email to create servers or join more from Explore.',
      }),
    );
    const flow = buildFlow(true);

    await flow.handleJoinDiscoverableServer({
      id: '1490467017554264064',
      name: 'Server',
      pfp: '',
    });

    expect(mockRequestGuestExploreJoinBlockedModal).toHaveBeenCalledWith(
      'Create an account with email to create servers or join more from Explore.',
    );
    expect(flow.addServerJoinError.value).toContain(
      'Guests can’t join from Explore',
    );
    expect(dispatchAppToastDetail).not.toHaveBeenCalled();
  });

  it('shows feedback when invite link field is empty', async () => {
    const flow = buildFlow(true);

    await flow.handleJoinWithInviteLink('   ');

    expect(flow.addServerJoinError.value).toBe('Enter an invite link.');
    expect(dispatchAppToastDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Enter an invite link.',
        severity: 'warning',
      }),
    );
    expect(postEchoJoinWithInviteToken).not.toHaveBeenCalled();
  });

  it('shows feedback for invite URL with no token before confirm', async () => {
    const flow = buildFlow(true);

    await flow.handleJoinWithInviteLink('https://example.com/');

    expect(flow.addServerJoinError.value).toBe('That invite link is invalid.');
    expect(postEchoJoinWithInviteToken).not.toHaveBeenCalled();
  });

  it('ignores invite join while already in flight', async () => {
    const flow = buildFlow(true);
    flow.addServerInviteJoinBusy.value = true;
    await flow.handleJoinWithInviteLink('abc');
    expect(postEchoJoinWithInviteToken).not.toHaveBeenCalled();
  });

  it('shows banned feedback for explore rejoins using API detail', async () => {
    vi.mocked(postEchoJoinDirectoryServer).mockRejectedValueOnce(
      new EchoApiError(403, {
        code: 'FORBIDDEN',
        message: 'Forbidden',
        detail: 'BANNED_FROM_SERVER',
      }),
    );
    const flow = buildFlow(true);

    await flow.handleJoinDiscoverableServer({
      id: '1490467017554264064',
      name: 'Server',
      pfp: '',
    });

    expect(flow.addServerJoinError.value).toBe(
      'You are banned from this server.',
    );
  });
});
