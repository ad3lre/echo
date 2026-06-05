import { computed, watch, type ComputedRef, type Ref } from 'vue';
import { useDmProfileSidePanelLayout } from '@/composables/useDmProfileSidePanelLayout';
import { useAppLayoutProfileSafety } from './useAppLayoutProfileSafety';
import { useAppLayoutProfiles } from './useAppLayoutProfiles';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { selectPresence, selectSelfPresence } from '@/services/domain/presence';
import { type PopoutAnchorRect } from '@/utils/memberProfiles';
import type { ChannelSummary } from '@shared/types';
import {
  fetchProfileMutualFriends,
  removeEchoFriend,
  shouldUseEchoProfileSocialApi,
} from '@/services/orchestration/profileSocial';
import { invalidateInFlightEchoWorkspaceSocialRefresh } from '@/services/orchestration/workspaceEchoHydrateFromApi';
import type { EchoServerMemberDto } from '@/api/echo/types';
import { memberPanelDiag } from '@/utils/memberPanelDiag';
import { isEchoPublicBadgeId } from '@shared/echoAccountBadges';

type SelectedServer =
  | { id: string; name: string; imageUrl?: string }
  | null
  | undefined;

type DomainUser = {
  id: string;
  name: string;
  username?: string;
  pfp: string;
  status?: string;
  customStatus?: string;
  isDiscordShadow?: boolean;
  isGuest?: boolean;
  badges?: string[];
};

function workspaceUserBadges(
  rosterRow: EchoServerMemberDto | undefined,
  userRow: DomainUser | undefined,
): string[] | undefined {
  const fromRo = rosterRow?.badges;
  if (Array.isArray(fromRo) && fromRo.length) {
    const x = fromRo.filter(
      (b): b is string => typeof b === 'string' && b.trim().length > 0,
    );
    if (x.length) return x;
  }
  const fromU = userRow?.badges;
  if (Array.isArray(fromU) && fromU.length) {
    return fromU.filter((b) => typeof b === 'string' && b.trim().length > 0);
  }
  return undefined;
}

function normalizePublicBadges(
  raw: readonly string[] | undefined,
): string[] | undefined {
  const base = (raw ?? []).filter((b): b is string =>
    typeof b === 'string' ? isEchoPublicBadgeId(b) : false,
  );
  return base.length ? base : undefined;
}

export function useAppLayoutProfilesDomain(deps: {
  workspace: any;
  authSession: any;
  serverStore: any;
  currentUser: ComputedRef<any>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  selectedServerEcho: ComputedRef<SelectedServer>;
  selectedServerView: ComputedRef<SelectedServer>;
  customStatus: Ref<string>;
  echoBlockedUserIds: Ref<Set<string>>;
  isMemberPopoutOpen: Ref<boolean>;
  isSelfProfilePopoutOpen: Ref<boolean>;
  isExpandedProfileModalOpen: Ref<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  isGroupOverviewOpen: Ref<boolean>;
  activeMemberProfile: Ref<any | null>;
  expandedProfile: Ref<any | null>;
  expandedProfileTargetUserId: Ref<string | null>;
  profileNotes: Ref<Record<string, string>>;
  memberPopoutAnchor: Ref<PopoutAnchorRect | null>;
  selfProfileAnchor: Ref<PopoutAnchorRect | null>;
  selfProfile: Ref<any | null>;
  isInDMChat: Ref<boolean>;
  isInDMMode: Ref<boolean>;
  leaveDmUiIfViewingUser: (userId: string) => void;
  canChangeMemberNicknameInServer: (targetUserId: string) => boolean;
  hydrateEchoFromApi: () => Promise<void>;
  refreshEchoRoleData: () => void;
  workspaceMembersByServer: Ref<Record<string, EchoServerMemberDto[]>>;
  presenceByUserId: Ref<Record<string, string | undefined>>;
  presenceMobileByUserId: Ref<Record<string, true>>;
}) {
  const {
    workspace,
    authSession,
    serverStore,
    currentUser,
    activeChannel,
    selectedServerEcho,
    selectedServerView,
    customStatus,
    echoBlockedUserIds,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    isGroupOverviewOpen,
    activeMemberProfile,
    expandedProfile,
    expandedProfileTargetUserId,
    profileNotes,
    memberPopoutAnchor,
    selfProfileAnchor,
    selfProfile,
    isInDMChat,
    isInDMMode,
    leaveDmUiIfViewingUser,
    canChangeMemberNicknameInServer,
    hydrateEchoFromApi,
    refreshEchoRoleData,
    workspaceMembersByServer,
    presenceByUserId,
    presenceMobileByUserId,
  } = deps;

  const { canShowDmProfileSidePanel } = useDmProfileSidePanelLayout();

  watch(canShowDmProfileSidePanel, (can) => {
    if (
      can ||
      !isExpandedProfileModalOpen.value ||
      !isExpandedProfileSidePanel.value ||
      !isInDMChat.value
    ) {
      return;
    }
    isExpandedProfileSidePanel.value = false;
  });

  function onExpandedProfileModalUpdate(next: boolean) {
    isExpandedProfileModalOpen.value = next;
    if (!next) {
      expandedProfile.value = null;
      expandedProfileTargetUserId.value = null;
    }
  }

  async function removeEchoFriendOnServer(peerId: string) {
    const token = authSession.accessToken?.trim() ?? '';
    if (!peerId.trim()) return;
    invalidateInFlightEchoWorkspaceSocialRefresh();
    workspace.friendIds.value = workspace.friendIds.value.filter(
      (id: string) => id !== peerId,
    );
    if (
      !shouldUseEchoProfileSocialApi({
        isMockDataMode: echoSyncCapabilities.isMockDataMode,
        isAuthenticated: authSession.isAuthenticated,
        isGuest: authSession.backendUser?.isGuest === true,
        token,
      })
    ) {
      await workspace.refreshEchoSocialFromApi();
      return;
    }
    try {
      const result = await removeEchoFriend({ token, peerId });
      if (result.benign) return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportPrimaryFlowFailure('postEchoRemoveFriend', e, { peerId });
      dispatchAppToast(
        msg.trim() || 'Could not remove friend. Try again.',
        'warning',
      );
    } finally {
      await workspace.refreshEchoSocialFromApi();
    }
  }

  function handleExpandedProfileRemoveFriend(userId: string) {
    void removeEchoFriendOnServer(userId);
  }

  const shouldProactivelyRefreshSocial = computed(() => {
    if (echoSyncCapabilities.isMockDataMode) return false;
    if (!authSession.isAuthenticated) return false;
    if (authSession.backendUser?.isGuest === true) return false;
    return true;
  });

  watch(
    () =>
      ({
        anyProfileOpen:
          isExpandedProfileModalOpen.value ||
          isMemberPopoutOpen.value ||
          isSelfProfilePopoutOpen.value,
        socialStatus: deps.workspace?.socialGraphStatus?.value ?? null,
      }) as const,
    (s) => {
      if (!s.anyProfileOpen) return;
      if (!shouldProactivelyRefreshSocial.value) return;
      if (s.socialStatus === 'ready' || s.socialStatus === 'loading') return;
      void deps.workspace?.refreshEchoSocialFromApi?.();
    },
    { immediate: true },
  );

  const profileSafety = useAppLayoutProfileSafety({
    workspace,
    authSession,
    serverStore,
    currentUser,
    selectedServer: selectedServerEcho,
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
  });

  const profiles = useAppLayoutProfiles({
    users: workspace.users,
    servers: workspace.servers,
    serverMemberIds: workspace.serverMemberIds,
    friendIdsByUserId: workspace.friendIdsByUserId,
    friendIds: workspace.friendIds,
    currentUser,
    selectedServer: selectedServerView,
    workspaceMembersByServer,
    isInDMChat,
    isInDMMode,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    canShowDmProfileSidePanel,
    isGroupOverviewOpen,
    activeMemberProfile,
    expandedProfile,
    expandedProfileTargetUserId,
    profileNotes,
    memberPopoutAnchor,
    selfProfileAnchor,
    selfProfile,
  });

  let expandedProfileMutualFetchGen = 0;
  watch(
    () =>
      isExpandedProfileModalOpen.value
        ? (expandedProfileTargetUserId.value?.trim() ??
          expandedProfile.value?.id?.trim() ??
          null)
        : null,
    async (peerId, prevPeerId) => {
      if (
        peerId &&
        prevPeerId &&
        peerId !== prevPeerId &&
        expandedProfile.value
      ) {
        expandedProfile.value = {
          ...(expandedProfile.value as any),
          mutualFriends: [],
        };
      }
      if (!peerId) return;
      const token = authSession.accessToken?.trim() ?? '';
      if (
        !shouldUseEchoProfileSocialApi({
          isMockDataMode: echoSyncCapabilities.isMockDataMode,
          isAuthenticated: authSession.isAuthenticated,
          isGuest: authSession.backendUser?.isGuest === true,
          token,
        })
      ) {
        return;
      }
      expandedProfileMutualFetchGen += 1;
      const gen = expandedProfileMutualFetchGen;
      try {
        const mutualFriends = await fetchProfileMutualFriends({
          token,
          peerId,
          users: workspace.users.value as DomainUser[],
        });
        if (gen !== expandedProfileMutualFetchGen) return;
        if (expandedProfile.value?.id !== peerId) return;
        expandedProfile.value = {
          ...(expandedProfile.value as any),
          mutualFriends,
        } as any;
      } catch (e) {
        reportPrimaryFlowFailure('fetchEchoMutualFriends', e, { peerId });
      }
    },
  );

  const isMemberPopoutFriend = computed(() => {
    const id = activeMemberProfile.value?.id?.trim();
    if (!id) return false;
    if (workspace.friendIds.value.some((fid: string) => fid.trim() === id)) {
      return true;
    }
    const me = authSession.backendUser?.id?.trim();
    if (!me) return false;
    const fromMap = workspace.friendIdsByUserId.value[me] ?? [];
    return fromMap.some((fid: string) => fid.trim() === id);
  });

  const isMemberPopoutCanSendFriendRequest = computed(() => {
    const p = activeMemberProfile.value;
    const id = p?.id?.trim();
    if (!id) return false;
    if (isMemberPopoutFriend.value) return false;
    if (p.isDiscordShadow) return false;
    if ((p as any).isGuest) return false;
    const me = authSession.backendUser?.id?.trim();
    if (!me || id === me) return false;
    if (authSession.backendUser?.isGuest === true) return false;
    const known =
      echoSyncCapabilities.isMockDataMode ||
      deps.workspace?.socialGraphStatus?.value === 'ready';
    if (!known) return false;
    const blockedIds: string[] = workspace.blockedUserIds?.value ?? [];
    if (blockedIds.some((bid: string) => bid.trim() === id)) return false;
    const outgoing: { toUserId: string }[] =
      workspace.friendRequestsOutgoing.value ?? [];
    if (outgoing.some((r) => r.toUserId.trim() === id)) return false;
    return true;
  });

  const isExpandedProfileOutgoingRequest = computed(() => {
    const p = expandedProfile.value;
    if (!p?.id) return false;
    return workspace.friendRequestsOutgoing.value.some(
      (r: { toUserId: string }) => r.toUserId === p.id,
    );
  });

  const isExpandedProfileIncomingRequest = computed(() => {
    const p = expandedProfile.value;
    if (!p?.id) return false;
    return workspace.friendRequestsIncoming.value.some(
      (r: { fromUserId: string }) => r.fromUserId === p.id,
    );
  });

  function handleExpandedProfileCancelOutgoingFriendRequest(userId: string) {
    const req = workspace.friendRequestsOutgoing.value.find(
      (r: { id: string; toUserId: string }) => r.toUserId === userId,
    );
    if (req) void workspace.cancelFriendRequest(req.id);
  }

  function handleExpandedProfileAcceptIncomingFriendRequest(userId: string) {
    const req = workspace.friendRequestsIncoming.value.find(
      (r: { id: string; fromUserId: string }) => r.fromUserId === userId,
    );
    if (req) void workspace.acceptFriendRequest(req.id);
  }

  function handleExpandedProfileDeclineIncomingFriendRequest(userId: string) {
    const req = workspace.friendRequestsIncoming.value.find(
      (r: { id: string; fromUserId: string }) => r.fromUserId === userId,
    );
    if (req) void workspace.declineFriendRequest(req.id);
  }

  const usersById = computed(() => {
    const map = new Map<string, DomainUser>();
    for (const u of workspace.users.value) {
      map.set(u.id, u as DomainUser);
    }
    return map;
  });

  function resolveDomainUserPresence(
    userId: string,
    rowStatus: string | undefined,
    diagnosticsKey: string,
  ) {
    const selfId = authSession.backendUser?.id;
    if (selfId && userId === selfId) {
      return selectSelfPresence({
        userId,
        authoritativeStatusesByUserId: presenceByUserId.value,
        sessionStatus: authSession.backendUser?.status,
        rowStatus,
        diagnosticsKey,
        mobileSurface: !!presenceMobileByUserId.value[userId],
      });
    }
    return selectPresence({
      authoritativeStatus: presenceByUserId.value[userId],
      rowStatus,
      diagnosticsKey,
      mobileSurface: !!presenceMobileByUserId.value[userId],
    });
  }

  const memberListUsers = computed(() => {
    const sid = serverStore.selectedServerId;
    if (!sid || sid === 'echo') {
      memberPanelDiag('memberListUsers', {
        branch: 'no_server_or_echo',
        sid: sid ?? null,
      });
      return [];
    }

    let memberIds = workspace.serverMemberIds.value[sid] ?? [];
    const fromServerMemberIdsLen = memberIds.length;
    if (memberIds.length === 0) {
      const roster = workspaceMembersByServer.value[sid];
      if (roster?.length) {
        memberIds = roster.map((m) => m.userId).filter(Boolean);
      }
    }
    const fromRosterFallbackLen = memberIds.length;
    const me = authSession.backendUser?.id;
    if (memberIds.length === 0 && me) {
      const joined = workspace.servers.value.some(
        (s: { id: string }) => s.id === sid,
      );
      if (joined) memberIds = [me];
    }
    if (memberIds.length === 0) {
      memberPanelDiag('memberListUsers', {
        branch: 'no_member_ids',
        sid,
        me: me ?? null,
        fromServerMemberIdsLen,
        fromRosterFallbackLen,
        rosterLen: workspaceMembersByServer.value[sid]?.length ?? 0,
        serversHasSid: workspace.servers.value.some(
          (s: { id: string }) => s.id === sid,
        ),
      });
      return [];
    }

    const uMap = usersById.value;
    const nicks = workspace.serverMemberNicknames?.value?.[sid] ?? {};
    const roster = workspaceMembersByServer.value[sid];
    const channelAccessibleMemberIds =
      activeChannel.value?.accessibleMemberUserIds;
    const channelAccessibleMemberIdSet = Array.isArray(
      channelAccessibleMemberIds,
    )
      ? new Set(
          channelAccessibleMemberIds
            .map((id) => String(id).trim())
            .filter(Boolean),
        )
      : null;
    const rosterById = new Map(
      (roster ?? []).map((m) => [m.userId, m] as const),
    );

    let droppedChannelAccess = 0;
    let droppedDiscordShadow = 0;
    const visibleMemberIds = memberIds.filter((id: string) => {
      if (
        channelAccessibleMemberIdSet &&
        !channelAccessibleMemberIdSet.has(id)
      ) {
        droppedChannelAccess++;
        return false;
      }
      const u = uMap.get(id);
      const ro = rosterById.get(id);
      const isDiscordShadow =
        ro?.isDiscordShadow === true ||
        (!!u &&
          typeof u === 'object' &&
          'isDiscordShadow' in u &&
          (u as { isDiscordShadow?: boolean }).isDiscordShadow === true);
      if (isDiscordShadow) {
        droppedDiscordShadow++;
        return false;
      }
      return true;
    });

    memberPanelDiag('memberListUsers', {
      branch: 'built',
      sid,
      activeChannelId: activeChannel.value?.id ?? null,
      channelAccessibleFilter: channelAccessibleMemberIdSet != null,
      channelAccessibleSetSize: channelAccessibleMemberIdSet?.size ?? null,
      memberIdsIn: memberIds.length,
      visibleOut: visibleMemberIds.length,
      droppedChannelAccess,
      droppedDiscordShadow,
      workspaceUsersLen: workspace.users.value.length,
    });

    const authU = authSession.backendUser;

    return visibleMemberIds.map((id: string) => {
      const u = uMap.get(id);
      const ro = rosterById.get(id);
      const nick = nicks[id]?.trim();
      const isGuest =
        ro?.isGuest === true ||
        (!!u &&
          typeof u === 'object' &&
          'isGuest' in u &&
          (u as { isGuest?: boolean }).isGuest === true);
      if (u) {
        const du = u as DomainUser;
        const isSelf = !!(me && du.id === me && authU?.id === me);
        const status = resolveDomainUserPresence(
          du.id,
          du.status,
          `member-list-domain:${du.id}`,
        ).status;
        return {
          id: du.id,
          name: nick || du.name,
          ...(nick ? { nickname: nick } : {}),
          ...(du.username ? { username: du.username } : {}),
          pfp: du.pfp,
          status,
          customStatus: isSelf
            ? (authU?.customStatus ?? du.customStatus)
            : du.customStatus,
          ...(isGuest ? { isGuest: true as const } : {}),
          badges: normalizePublicBadges(workspaceUserBadges(ro, du)),
        };
      }
      return {
        id,
        name: 'Unknown',
        pfp: '',
        status: undefined as string | undefined,
        ...(isGuest ? { isGuest: true as const } : {}),
        badges: normalizePublicBadges(workspaceUserBadges(ro, undefined)),
      };
    });
  });

  /**
   * Full server roster for **Server Settings → Members** (Echo + Import placeholders).
   * Unlike {@link memberListUsers}, this does not drop `isDiscordShadow` users or apply
   * the active channel’s `accessibleMemberUserIds` filter — settings are server-wide.
   */
  const serverSettingsMemberUsers = computed(() => {
    const sid = serverStore.selectedServerId;
    if (!sid || sid === 'echo') return [];

    let memberIds = workspace.serverMemberIds.value[sid] ?? [];
    if (memberIds.length === 0) {
      const roster = workspaceMembersByServer.value[sid];
      if (roster?.length) {
        memberIds = roster.map((m) => m.userId).filter(Boolean);
      }
    }
    const me = authSession.backendUser?.id;
    if (memberIds.length === 0 && me) {
      const joined = workspace.servers.value.some(
        (s: { id: string }) => s.id === sid,
      );
      if (joined) memberIds = [me];
    }
    if (memberIds.length === 0) return [];

    const uMap = usersById.value;
    const nicks = workspace.serverMemberNicknames?.value?.[sid] ?? {};
    const roster = workspaceMembersByServer.value[sid];
    const rosterById = new Map(
      (roster ?? []).map((m) => [m.userId, m as EchoServerMemberDto] as const),
    );

    const authU = authSession.backendUser;

    return memberIds.map((id: string) => {
      const u = uMap.get(id);
      const ro = rosterById.get(id);
      const nick = nicks[id]?.trim();
      const isGuest =
        ro?.isGuest === true ||
        (!!u &&
          typeof u === 'object' &&
          'isGuest' in u &&
          (u as { isGuest?: boolean }).isGuest === true);
      const isDiscordShadow =
        ro?.isDiscordShadow === true ||
        (!!u &&
          typeof u === 'object' &&
          'isDiscordShadow' in u &&
          (u as { isDiscordShadow?: boolean }).isDiscordShadow === true);

      const nameFromRoster =
        ro && typeof ro.name === 'string' ? ro.name.trim() : '';

      if (u) {
        const du = u as DomainUser;
        const isSelf = !!(me && du.id === me && authU?.id === me);
        const status = resolveDomainUserPresence(
          du.id,
          du.status,
          `server-settings-members:${du.id}`,
        ).status;
        return {
          id: du.id,
          name: nick || du.name,
          pfp: du.pfp,
          status,
          customStatus: isSelf
            ? (authU?.customStatus ?? du.customStatus)
            : du.customStatus,
          ...(isGuest ? { isGuest: true as const } : {}),
          ...(isDiscordShadow ? { isDiscordShadow: true as const } : {}),
          badges: normalizePublicBadges(workspaceUserBadges(ro, du)),
        };
      }
      return {
        id,
        name: nameFromRoster || 'Unknown',
        ...(nick ? { nickname: nick } : {}),
        pfp: ro && typeof ro.pfp === 'string' ? ro.pfp : '',
        status: undefined as string | undefined,
        ...(isGuest ? { isGuest: true as const } : {}),
        ...(isDiscordShadow ? { isDiscordShadow: true as const } : {}),
        badges: normalizePublicBadges(workspaceUserBadges(ro, undefined)),
      };
    });
  });

  const usersForChannelPanel = computed(() => {
    const m = memberListUsers.value;
    if (m.length > 0) return m;
    const authU = authSession.backendUser;
    return workspace.users.value.map((u: DomainUser) => {
      const isSelf = !!(authU?.id && u.id === authU.id);
      const status = resolveDomainUserPresence(
        u.id,
        u.status,
        `channel-panel-domain:${u.id}`,
      ).status;
      return {
        id: u.id,
        name: u.name,
        ...(u.username ? { username: u.username } : {}),
        pfp: u.pfp,
        status,
        customStatus: isSelf
          ? (authU?.customStatus ?? u.customStatus)
          : u.customStatus,
        badges: normalizePublicBadges(u.badges),
      };
    });
  });

  async function removeFriend(userId: string) {
    await removeEchoFriendOnServer(userId);
  }

  return {
    onExpandedProfileModalUpdate,
    removeEchoFriendOnServer,
    handleExpandedProfileRemoveFriend,
    removeFriend,
    memberListUsers,
    serverSettingsMemberUsers,
    usersForChannelPanel,
    isMemberPopoutFriend,
    isMemberPopoutCanSendFriendRequest,
    isExpandedProfileOutgoingRequest,
    isExpandedProfileIncomingRequest,
    handleExpandedProfileCancelOutgoingFriendRequest,
    handleExpandedProfileAcceptIncomingFriendRequest,
    handleExpandedProfileDeclineIncomingFriendRequest,
    ...profileSafety,
    ...profiles,
  };
}
