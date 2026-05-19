import type { ComputedRef, Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import { canMemberLeaveEchoServer } from '@/utils/echoServerOwnership';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export function useAppLayoutServerRailActions(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  currentUser: ComputedRef<{ id: string } | undefined>;
  devModeIdsEnabled: Ref<boolean>;
  canOpenServerSettings: ComputedRef<boolean>;
  canOpenServerSettingsForServer: (serverId: string) => boolean;
  canOpenInviteForServer: (serverId: string) => boolean;
  openServerSurface: (serverId: string) => void;
  isServerSettingsModalOpen: Ref<boolean>;
  isInviteModalOpen: Ref<boolean>;
  isServerNotificationSettingsOpen: Ref<boolean>;
  isMoreServersPinned: Ref<boolean>;
  isMoreServersPanelOpen: Ref<boolean>;
  /** Clears voice-specific invite context when opening a generic server invite. */
  clearInviteVoiceContext?: () => void;
  markServerAsRead: (serverId: string) => void | Promise<void>;
  openLeaveServerOwnerBlockedModal: () => void;
  openLeaveServerConfirmModal: (payload: {
    serverId: string;
    serverName: string;
  }) => void;
}) {
  function openServerSettingsIfAllowed() {
    if (deps.canOpenServerSettings.value)
      deps.isServerSettingsModalOpen.value = true;
  }

  function handleServerRailSettings(serverId: string) {
    if (!deps.canOpenServerSettingsForServer(serverId)) return;
    deps.openServerSurface(serverId);
    deps.isServerSettingsModalOpen.value = true;
  }

  function handleServerRailInvite(serverId: string) {
    const sid = serverId.trim();
    if (!sid) {
      dispatchAppToast('Select a server before inviting people.', 'warning');
      return;
    }
    if (!deps.currentUser.value?.id) {
      dispatchAppToast('Sign in to invite people to a server.', 'info');
      return;
    }
    if (!deps.canOpenInviteForServer(sid)) {
      dispatchAppToast(
        "You don't have permission to invite people to this server.",
        'warning',
      );
      return;
    }
    deps.clearInviteVoiceContext?.();
    deps.openServerSurface(sid);
    if (!deps.isMoreServersPinned.value) {
      deps.isMoreServersPanelOpen.value = false;
    }
    deps.isInviteModalOpen.value = true;
  }

  function handleServerRailNotificationSettings(serverId: string) {
    deps.openServerSurface(serverId);
    deps.isServerNotificationSettingsOpen.value = true;
  }

  function handleServerRailMarkRead(serverId: string) {
    void deps.markServerAsRead(serverId);
  }

  function handleServerRailLeave(serverId: string) {
    const s = deps.serverStore.servers.find((x) => x.id === serverId);
    if (!s) return;
    const uid = deps.currentUser.value?.id;
    const devOverride = deps.devModeIdsEnabled.value;
    if (!canMemberLeaveEchoServer(s, uid) && !devOverride) {
      deps.openLeaveServerOwnerBlockedModal();
      return;
    }
    deps.openLeaveServerConfirmModal({ serverId, serverName: s.name });
  }

  function openServerFromMore(serverId: string) {
    deps.openServerSurface(serverId);
    if (!deps.isMoreServersPinned.value) {
      deps.isMoreServersPanelOpen.value = false;
    }
  }

  return {
    openServerSettingsIfAllowed,
    handleServerRailSettings,
    handleServerRailInvite,
    handleServerRailNotificationSettings,
    handleServerRailMarkRead,
    handleServerRailLeave,
    openServerFromMore,
  };
}
