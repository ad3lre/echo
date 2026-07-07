import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { useAppLayoutServerRailActions } from './useAppLayoutServerRailActions';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToast: vi.fn(),
}));

function makeDeps(overrides?: {
  currentUserId?: string | null;
  canOpenInviteForServer?: (serverId: string) => boolean;
  canOpenServerSettingsForServer?: (serverId: string) => boolean;
  isMoreServersPinned?: boolean;
  isMoreServersPanelOpen?: boolean;
}) {
  const currentUser = ref<{ id: string } | undefined>(
    overrides?.currentUserId === null
      ? undefined
      : { id: overrides?.currentUserId ?? 'u1' },
  );
  const isInviteModalOpen = ref(false);
  const isServerNotificationSettingsOpen = ref(false);
  const isMoreServersPinned = ref(overrides?.isMoreServersPinned ?? false);
  const isMoreServersPanelOpen = ref(overrides?.isMoreServersPanelOpen ?? true);
  const openServerSurface = vi.fn();
  const clearInviteVoiceContext = vi.fn();

  const actions = useAppLayoutServerRailActions({
    serverStore: { servers: [] } as any,
    currentUser: computed(() => currentUser.value),
    devModeIdsEnabled: ref(false),
    canOpenServerSettings: computed(() => false),
    canOpenServerSettingsForServer:
      overrides?.canOpenServerSettingsForServer ?? (() => true),
    canOpenInviteForServer: overrides?.canOpenInviteForServer ?? (() => true),
    openServerSurface,
    isServerSettingsModalOpen: ref(false),
    isInviteModalOpen,
    isServerNotificationSettingsOpen,
    isMoreServersPinned,
    isMoreServersPanelOpen,
    clearInviteVoiceContext,
    markServerAsRead: vi.fn(),
    openLeaveServerOwnerBlockedModal: vi.fn(),
    openLeaveServerConfirmModal: vi.fn(),
  });

  return {
    actions,
    isInviteModalOpen,
    isServerNotificationSettingsOpen,
    isMoreServersPinned,
    isMoreServersPanelOpen,
    openServerSurface,
    clearInviteVoiceContext,
  };
}

describe('useAppLayoutServerRailActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the invite modal and closes the more-servers panel when allowed', () => {
    const d = makeDeps();

    d.actions.handleServerRailInvite(' s1 ');

    expect(d.clearInviteVoiceContext).toHaveBeenCalledTimes(1);
    expect(d.openServerSurface).toHaveBeenCalledWith('s1');
    expect(d.isInviteModalOpen.value).toBe(true);
    expect(d.isMoreServersPanelOpen.value).toBe(false);
  });

  it('keeps the more-servers panel open when pinned', () => {
    const d = makeDeps({ isMoreServersPinned: true });

    d.actions.handleServerRailInvite('s1');

    expect(d.isInviteModalOpen.value).toBe(true);
    expect(d.isMoreServersPanelOpen.value).toBe(true);
  });

  it('shows a sign-in toast instead of failing silently', () => {
    const d = makeDeps({ currentUserId: null });

    d.actions.handleServerRailInvite('s1');

    expect(d.openServerSurface).not.toHaveBeenCalled();
    expect(d.isInviteModalOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      'Sign in to invite people to a server.',
      'info',
    );
  });

  it('shows a permission toast instead of failing silently', () => {
    const d = makeDeps({ canOpenInviteForServer: () => false });

    d.actions.handleServerRailInvite('s1');

    expect(d.openServerSurface).not.toHaveBeenCalled();
    expect(d.isInviteModalOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      "You don't have permission to invite people to this server.",
      'warning',
    );
  });

  it('shows a toast instead of failing silently for Direct Messages notification settings', () => {
    const d = makeDeps();

    d.actions.handleServerRailNotificationSettings('echo');

    expect(d.isServerNotificationSettingsOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      'Notification settings are not available for Direct Messages.',
      'info',
    );
  });

  it('shows a permission toast instead of failing silently for server settings', () => {
    const d = makeDeps({ canOpenServerSettingsForServer: () => false });

    d.actions.handleServerRailSettings('s1');

    expect(d.openServerSurface).not.toHaveBeenCalled();
    expect(dispatchAppToast).toHaveBeenCalledWith(
      "You don't have permission to open server settings.",
      'warning',
    );
  });
});
