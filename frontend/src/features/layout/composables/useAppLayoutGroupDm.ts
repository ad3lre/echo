import { ref, type Ref } from 'vue';
import type { DmSubView } from '@/features/layout/mainSurface';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { ensureChannelBucket } from '@/services/realtime/channelMessageAuthority';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';

export type OpenGroupDmOnServerFn = (args: {
  name: string;
  memberIds: string[];
  currentUserId: string;
}) => Promise<string | null>;

export type OpenGroupDmModalPayload = {
  preselectedIds?: string[];
  lockedIds?: string[];
  targetGroupId?: string;
};

interface UseAppLayoutGroupDmOptions {
  groupDMs: Ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >;
  groupDMPreselectedIds: Ref<string[]>;
  groupDMLockedIds: Ref<string[]>;
  isGroupDMModalOpen: Ref<boolean>;
  isGroupDMSettingsOpen: Ref<boolean>;
  groupDmSettingsInitialFocus: Ref<'name' | 'icon' | null>;
  activeGroupSettingsId: Ref<string | null>;
  activeChannelId: Ref<string>;
  selectedDMUserId: Ref<string | null>;
  dmActiveTab: Ref<DmSubView>;
  selectedMessageRequestId: Ref<string | null>;
  isDMPanelOpen: Ref<boolean>;
  pfpBarExpanded: Ref<boolean>;
  currentUserId: Ref<string | undefined>;
  dmPartnerUserId: Ref<string | null>;
  activeGroupId: Ref<string | null>;
  users: Ref<Array<{ id: string; pfp: string }>>;
  messages: Ref<Record<string, RawMessage[]>>;
  selectServer: (id: string) => void;
  isInDMChat: Ref<boolean>;
  isGroupOverviewOpen: Ref<boolean>;
  isExpandedProfileModalOpen: Ref<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  expandedProfile: Ref<any | null>;
  expandedProfileTargetUserId: Ref<string | null>;
  openGroupDmOnServer: OpenGroupDmOnServerFn;
  addMembersToGroupDmOnServer?: (args: {
    channelId: string;
    memberUserIds: string[];
  }) => Promise<void>;
  persistGroupDmSettings?: (args: {
    channelId: string;
    name: string;
    pfp: string;
  }) => Promise<void>;
  /** Dismiss overlays (pins, search) that use high z-index / capture phase listeners. */
  beforeOpenGroupDmModal?: () => void;
  /** Compact shell: hide DM list overlay after picking a group thread. */
  isCompactShell?: Ref<boolean>;
}

export function useAppLayoutGroupDm(options: UseAppLayoutGroupDmOptions) {
  const {
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    isDMPanelOpen,
    pfpBarExpanded,
    currentUserId,
    dmPartnerUserId,
    activeGroupId,
    users,
    selectServer,
    isInDMChat,
    isGroupOverviewOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    expandedProfile,
    expandedProfileTargetUserId,
    openGroupDmOnServer,
    addMembersToGroupDmOnServer,
    persistGroupDmSettings,
    beforeOpenGroupDmModal,
    isCompactShell,
  } = options;
  const groupDmAddMembersTargetId = ref<string | null>(null);

  function openGroupDMModal(payload?: OpenGroupDmModalPayload | Event) {
    beforeOpenGroupDmModal?.();
    const options =
      typeof Event !== 'undefined' && payload instanceof Event
        ? undefined
        : (payload as OpenGroupDmModalPayload | undefined);
    groupDmAddMembersTargetId.value = options?.targetGroupId?.trim() || null;
    if (options) {
      groupDMPreselectedIds.value = [...(options.preselectedIds ?? [])];
      groupDMLockedIds.value = [...(options.lockedIds ?? [])];
    } else if (dmPartnerUserId.value) {
      groupDMPreselectedIds.value = [dmPartnerUserId.value];
      groupDMLockedIds.value = [];
    } else {
      groupDMPreselectedIds.value = [];
      groupDMLockedIds.value = [];
    }
    isGroupDMModalOpen.value = true;
  }

  function leaveExpandedProfileForGroupNavigation(): void {
    const profileSidePanelWasOpen =
      isExpandedProfileModalOpen.value && isExpandedProfileSidePanel.value;
    isExpandedProfileModalOpen.value = false;
    isExpandedProfileSidePanel.value = false;
    expandedProfile.value = null;
    expandedProfileTargetUserId.value = null;
    if (profileSidePanelWasOpen) {
      isGroupOverviewOpen.value = true;
    }
  }

  async function handleCreateGroupDM(payload: {
    name: string;
    memberIds: string[];
  }) {
    const addTargetId = groupDmAddMembersTargetId.value;
    if (addTargetId) {
      const group = groupDMs.value[addTargetId];
      const existingIds = new Set(group?.memberIds ?? []);
      const nextMemberIds = payload.memberIds
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => !existingIds.has(id));
      if (!nextMemberIds.length) {
        groupDmAddMembersTargetId.value = null;
        return;
      }
      if (echoSyncCapabilities.isMockDataMode) {
        if (!group) return;
        groupDMs.value = {
          ...groupDMs.value,
          [addTargetId]: {
            ...group,
            memberIds: [...new Set([...group.memberIds, ...nextMemberIds])],
          },
        };
      } else {
        await addMembersToGroupDmOnServer?.({
          channelId: addTargetId,
          memberUserIds: nextMemberIds,
        });
      }
      groupDmAddMembersTargetId.value = null;
      return;
    }

    const curId = currentUserId.value;
    if (!curId) {
      return;
    }
    const memberSet = new Set<string>([curId, ...payload.memberIds]);
    const allMemberIds = Array.from(memberSet);
    const canTryServer =
      !echoSyncCapabilities.isMockDataMode && allMemberIds.length >= 3;
    const firstOtherMember = allMemberIds.find((id) => id !== curId);
    const fallbackUser =
      users.value.find((u) => u.id === firstOtherMember) ?? users.value[0];

    if (canTryServer) {
      const channelId = await openGroupDmOnServer({
        name: payload.name,
        memberIds: payload.memberIds,
        currentUserId: curId,
      });
      if (channelId) {
        leaveExpandedProfileForGroupNavigation();
        activeChannelId.value = channelId;
        selectedDMUserId.value = null;
        dmActiveTab.value = 'messages';
        selectedMessageRequestId.value = null;
        selectServer('echo');
        isDMPanelOpen.value = isCompactShell?.value ? false : true;
        pfpBarExpanded.value = false;
        return;
      }
    }

    // Client-only `dm-group-*` ids are not persisted Echo channels — sockets reject with UNKNOWN_CHANNEL.
    if (!echoSyncCapabilities.isMockDataMode) {
      return;
    }

    const id = `dm-group-${Date.now().toString(36)}`;
    groupDMs.value = {
      ...groupDMs.value,
      [id]: {
        id,
        name: payload.name,
        memberIds: allMemberIds,
        pfp: fallbackUser?.pfp ?? '',
      },
    };
    ensureChannelBucket(id);
    leaveExpandedProfileForGroupNavigation();
    activeChannelId.value = id;
    selectedDMUserId.value = null;
    dmActiveTab.value = 'messages';
    selectedMessageRequestId.value = null;
    selectServer('echo');
    isDMPanelOpen.value = isCompactShell?.value ? false : true;
    pfpBarExpanded.value = false;
  }

  function handleSelectGroupDM(groupId: string) {
    if (!groupDMs.value[groupId]) return;
    leaveExpandedProfileForGroupNavigation();
    activeChannelId.value = groupId;
    selectedDMUserId.value = null;
    dmActiveTab.value = 'messages';
    selectedMessageRequestId.value = null;
    selectServer('echo');
    isDMPanelOpen.value = isCompactShell?.value ? false : true;
    pfpBarExpanded.value = false;
  }

  function openGroupSettingsFromHeader(focus?: 'name' | 'icon') {
    const id = activeChannelId.value;
    if (!groupDMs.value[id]) return;
    groupDmSettingsInitialFocus.value = focus ?? null;
    activeGroupSettingsId.value = id;
    isGroupDMSettingsOpen.value = true;
  }

  function openGroupOverviewPanel() {
    const id = activeGroupId.value;
    if (!id || !isInDMChat.value) return;
    if (isGroupOverviewOpen.value) {
      isGroupOverviewOpen.value = false;
      return;
    }
    isExpandedProfileModalOpen.value = false;
    isExpandedProfileSidePanel.value = false;
    expandedProfile.value = null;
    expandedProfileTargetUserId.value = null;
    isGroupOverviewOpen.value = true;
  }

  function handleUpdateGroupFromSettings(
    payload: {
      name: string;
      pfp: string;
    },
    groupIdOverride?: string | null,
  ) {
    const id = (groupIdOverride ?? activeGroupSettingsId.value)?.trim();
    if (!id || !groupDMs.value[id]) return;
    groupDMs.value = {
      ...groupDMs.value,
      [id]: { ...groupDMs.value[id]!, name: payload.name, pfp: payload.pfp },
    };
    if (echoSyncCapabilities.isMockDataMode) {
      return;
    }
    void persistGroupDmSettings?.({
      channelId: id,
      name: payload.name,
      pfp: payload.pfp,
    }).catch(() => {});
  }

  return {
    openGroupDMModal,
    handleCreateGroupDM,
    handleSelectGroupDM,
    openGroupSettingsFromHeader,
    openGroupOverviewPanel,
    handleUpdateGroupFromSettings,
  };
}
