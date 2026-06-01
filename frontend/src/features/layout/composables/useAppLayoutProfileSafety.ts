import { computed, type Ref, type ComputedRef } from 'vue';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { useServerStore } from '@/stores/server';
import { isEchoAuthUserId, isEchoGraphId } from '@/utils/echoIds';
import {
  saveLocalProfile,
  overwriteLocalProfileFromAuthUser,
} from '@/utils/localProfilePersistence';
import { authPatchMe } from '@/api/authClient';
import {
  postEchoBlockUser,
  deleteEchoUnblockUser,
  patchEchoMemberNickname,
} from '@/api/echoClient';
import { openReportModal } from '@/features/safety/reportModal';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { requestAppPrompt } from '@/utils/appDialogs';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export function useAppLayoutProfileSafety(deps: {
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  serverStore: ReturnType<typeof useServerStore>;
  currentUser: ComputedRef<any>;
  selectedServer: ComputedRef<any>;
  customStatus: Ref<string>;
  echoBlockedUserIds: Ref<Set<string>>;
  isMemberPopoutOpen: Ref<boolean>;
  onExpandedProfileModalUpdate: (next: boolean) => void;
  leaveDmUiIfViewingUser: (userId: string) => void;
  handleExpandedProfileRemoveFriend: (userId: string) => void | Promise<void>;
  canChangeMemberNicknameInServer: (targetUserId: string) => boolean;
  hydrateEchoFromApi: () => Promise<void>;
  refreshEchoRoleData: () => void;
  expandedProfile: Ref<any>;
  activeMemberProfile: Ref<any>;
}) {
  const {
    workspace,
    authSession,
    serverStore: _serverStore,
    currentUser,
    selectedServer,
    customStatus,
    echoBlockedUserIds,
    isMemberPopoutOpen,
    onExpandedProfileModalUpdate,
    leaveDmUiIfViewingUser,
    handleExpandedProfileRemoveFriend,
    canChangeMemberNicknameInServer,
    hydrateEchoFromApi,
    refreshEchoRoleData,
    expandedProfile,
    activeMemberProfile,
  } = deps;

  let customStatusPatchTimer: ReturnType<typeof setTimeout> | null = null;
  const CUSTOM_STATUS_PATCH_DEBOUNCE_MS = 450;

  function handleUpdateCustomStatus(next: string) {
    customStatus.value = next;
    const curId = currentUser.value?.id;
    if (!curId) return;
    workspace.users.value = workspace.users.value.map((u) =>
      u.id === curId ? { ...u, customStatus: next } : u,
    );
    saveLocalProfile(curId, { customStatus: next });
    if (authSession.isAuthenticated && authSession.backendUser?.id === curId) {
      if (customStatusPatchTimer != null) {
        clearTimeout(customStatusPatchTimer);
        customStatusPatchTimer = null;
      }
      customStatusPatchTimer = setTimeout(() => {
        customStatusPatchTimer = null;
        const latest = customStatus.value;
        void authPatchMe({ customStatus: latest })
          .then(({ user }) => {
            if (authSession.backendUser?.id === user.id) {
              Object.assign(authSession.backendUser, user);
              overwriteLocalProfileFromAuthUser(user);
            }
          })
          .catch((e) => {
            reportPrimaryFlowFailure('authPatchMe.customStatus', e, {
              userId: curId,
            });
          });
      }, CUSTOM_STATUS_PATCH_DEBOUNCE_MS);
    }
  }

  function isEchoUserBlocked(userId: string): boolean {
    if (!userId) return false;
    return echoBlockedUserIds.value.has(userId);
  }

  async function handleProfileBlockUser(userId: string) {
    const self = currentUser.value?.id;
    if (!self || userId === self) return;
    if (
      !window.confirm(
        'Block this user? You will not receive their messages or friend requests.',
      )
    )
      return;
    const token = authSession.accessToken?.trim() ?? '';
    if (authSession.isAuthenticated) {
      try {
        await postEchoBlockUser(token, userId);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Could not block user');
        return;
      }
      const next = new Set(echoBlockedUserIds.value);
      next.add(userId);
      echoBlockedUserIds.value = next;
      workspace.blockedUserIds.value = [...next];
    } else if (!workspace.blockedUserIds.value.includes(userId)) {
      workspace.blockedUserIds.value = [
        ...workspace.blockedUserIds.value,
        userId,
      ];
    }
    void handleExpandedProfileRemoveFriend(userId);
    workspace.friendIds.value = workspace.friendIds.value.filter(
      (id) => id !== userId,
    );
    isMemberPopoutOpen.value = false;
    onExpandedProfileModalUpdate(false);
    leaveDmUiIfViewingUser(userId);
  }

  async function handleProfileUnblockUser(userId: string) {
    const self = currentUser.value?.id;
    if (!self || userId === self) return;
    const token = authSession.accessToken?.trim() ?? '';
    if (authSession.isAuthenticated) {
      try {
        await deleteEchoUnblockUser(token, userId);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Could not unblock user');
        return;
      }
      const next = new Set(echoBlockedUserIds.value);
      next.delete(userId);
      echoBlockedUserIds.value = next;
      workspace.blockedUserIds.value = [...next];
    } else {
      workspace.blockedUserIds.value = workspace.blockedUserIds.value.filter(
        (id) => id !== userId,
      );
    }
  }

  async function handleProfileReportUser(payload: {
    userId: string;
    reason?: string;
  }) {
    if (!payload.userId) return;
    const u = workspace.users.value.find((x) => x.id === payload.userId);
    openReportModal({
      kind: 'user',
      targetUserId: payload.userId,
      displayName: u?.name?.trim() || undefined,
    });
  }

  const isExpandedProfileTargetBlocked = computed(() => {
    const id = expandedProfile.value?.id;
    return id ? isEchoUserBlocked(id) : false;
  });

  const isMemberPopoutTargetBlocked = computed(() => {
    const id = activeMemberProfile.value?.id;
    return id ? isEchoUserBlocked(id) : false;
  });

  async function handleChangeMemberNicknameFromMemberList(
    targetUserId: string,
  ) {
    if (!canChangeMemberNicknameInServer(targetUserId)) return;
    const sid = selectedServer.value?.id ?? '';
    const u = workspace.users.value.find((x) => x.id === targetUserId);
    const mockNick =
      workspace.serverMemberNicknames?.value?.[sid]?.[targetUserId]?.trim();
    const currentLabel = (mockNick || u?.name || '').trim();
    const next = await requestAppPrompt({
      title: 'Change server nickname',
      message:
        'This name is shown only in this server. Leave empty to use your account name.',
      placeholder: 'Nickname',
      initialValue: currentLabel,
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
    });
    if (next == null) return;
    const trimmed = next.trim().slice(0, 32);
    const token = authSession.accessToken ?? '';
    if (!isEchoGraphId(sid) || !isEchoAuthUserId(targetUserId)) {
      dispatchAppToast('Cannot change nickname in this context.', 'warning');
      return;
    }
    const previousNick =
      workspace.serverMemberNicknames.value[sid]?.[targetUserId] ?? '';
    workspace.setServerMemberNickname(sid, targetUserId, trimmed);
    try {
      await patchEchoMemberNickname(token, sid, targetUserId, trimmed);
      void hydrateEchoFromApi().then(() => {
        refreshEchoRoleData();
      });
    } catch (e) {
      workspace.setServerMemberNickname(sid, targetUserId, previousNick);
      const msg =
        e instanceof Error ? e.message : "Something didn't work. Try again.";
      dispatchAppToast(`Could not update nickname: ${msg}`, 'warning');
    }
  }

  return {
    handleUpdateCustomStatus,
    handleProfileBlockUser,
    handleProfileUnblockUser,
    handleProfileReportUser,
    isExpandedProfileTargetBlocked,
    isMemberPopoutTargetBlocked,
    handleChangeMemberNicknameFromMemberList,
    isEchoUserBlocked,
  };
}
