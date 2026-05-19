import { computed, watch, type Ref } from 'vue';
import type { EchoServerMemberDto } from '@/api/echo/types';
import {
  applySessionPresenceToMemberProfile,
  buildExpandedProfile,
  buildMemberProfile,
  lookupServerMemberJoinedAtIso,
  type ExpandedProfile,
  type ExpandedProfileInputs,
  type MemberProfile,
  type PopoutAnchorRect,
} from '@/utils/memberProfiles';
import {
  loadProfileNotesMap,
  persistProfileNotesMap,
} from '@/utils/profileNotesPersistence';
import { useEchoSessionStore } from '@/stores/echoSession';

type User = {
  id: string;
  name: string;
  username?: string;
  pfp: string;
  badges?: string[];
};

type SelectedServer =
  | { id: string; name: string; imageUrl?: string }
  | null
  | undefined;

interface UseAppLayoutProfilesOptions {
  users: Ref<User[]>;
  servers: Ref<unknown[]>;
  serverMemberIds: Ref<Record<string, string[]>>;
  friendIdsByUserId: Ref<Record<string, string[]>>;
  friendIds: Ref<string[]>;
  currentUser: Ref<User | undefined>;
  selectedServer: Ref<SelectedServer>;
  /** Workspace roster: used for real per-server “Member since” dates. */
  workspaceMembersByServer: Ref<Record<string, EchoServerMemberDto[]>>;
  isInDMChat: Ref<boolean>;
  isMemberPopoutOpen: Ref<boolean>;
  isSelfProfilePopoutOpen: Ref<boolean>;
  isExpandedProfileModalOpen: Ref<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  /** When false, DM “profile overview” uses `ExpandedProfileModal` (side rail is `lg:` only). */
  canShowDmProfileSidePanel: Ref<boolean>;
  isGroupOverviewOpen: Ref<boolean>;
  activeMemberProfile: Ref<MemberProfile | null>;
  expandedProfile: Ref<ExpandedProfile | null>;
  expandedProfileTargetUserId: Ref<string | null>;
  profileNotes: Ref<Record<string, string>>;
  memberPopoutAnchor: Ref<PopoutAnchorRect | null>;
  selfProfileAnchor: Ref<PopoutAnchorRect | null>;
  selfProfile: Ref<MemberProfile | null>;
}

export function useAppLayoutProfiles(options: UseAppLayoutProfilesOptions) {
  const echoSession = useEchoSessionStore();
  const {
    users,
    servers,
    serverMemberIds,
    friendIdsByUserId,
    friendIds,
    currentUser,
    selectedServer,
    workspaceMembersByServer,
    isInDMChat,
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
  } = options;

  function memberJoinedAtForSelectedServer(userId: string): string | undefined {
    return lookupServerMemberJoinedAtIso(
      selectedServer.value?.id,
      userId,
      workspaceMembersByServer.value,
    );
  }

  function expandedProfileInputs(): ExpandedProfileInputs {
    return {
      servers: servers.value as ExpandedProfileInputs['servers'],
      users: users.value as ExpandedProfileInputs['users'],
      serverMemberIds: serverMemberIds.value,
      friendIdsByUserId: friendIdsByUserId.value,
    };
  }

  function buildExpandedProfileForUserId(
    userId: string,
  ): ExpandedProfile | null {
    const cur = currentUser.value;
    if (!cur) return null;
    const user = users.value.find((u) => u.id === userId);
    if (!user) return null;
    const memberProfile = buildMemberProfile(
      user as never,
      selectedServer.value?.id ?? 'echo',
      selectedServer.value?.name ?? 'Direct Messages',
      {
        memberJoinedAtIso: memberJoinedAtForSelectedServer(userId),
        serverImageUrl: selectedServer.value?.imageUrl,
      },
    );
    return buildExpandedProfile(memberProfile, cur.id, expandedProfileInputs());
  }

  function closeExpandedProfileShell() {
    isExpandedProfileModalOpen.value = false;
    isExpandedProfileSidePanel.value = false;
    expandedProfile.value = null;
    expandedProfileTargetUserId.value = null;
  }

  /** Bind profile shell to `userId`; clears stale fields before applying roster data. */
  function rehydrateExpandedProfileForUserId(userId: string): boolean {
    const trimmed = userId.trim();
    if (!trimmed) return false;
    const priorId =
      expandedProfileTargetUserId.value?.trim() ??
      expandedProfile.value?.id?.trim() ??
      '';
    const switching = priorId.length > 0 && priorId !== trimmed;
    expandedProfileTargetUserId.value = trimmed;
    if (switching) {
      expandedProfile.value = null;
    }
    const next = buildExpandedProfileForUserId(trimmed);
    if (!next) return false;
    expandedProfile.value = next;
    return true;
  }

  const expandedProfileLoading = computed(() => {
    if (!isExpandedProfileModalOpen.value) return false;
    const target = expandedProfileTargetUserId.value?.trim();
    if (!target) return false;
    return expandedProfile.value?.id?.trim() !== target;
  });

  watch(
    () =>
      [
        expandedProfileTargetUserId.value,
        isExpandedProfileModalOpen.value,
        users.value.map((u) => u.id).join('\n'),
      ] as const,
    () => {
      const target = expandedProfileTargetUserId.value?.trim();
      if (!target || !isExpandedProfileModalOpen.value) return;
      if (expandedProfile.value?.id?.trim() === target) return;
      rehydrateExpandedProfileForUserId(target);
    },
  );

  function openMemberProfile(
    userId: string,
    anchorRect: PopoutAnchorRect | null = null,
  ) {
    const user = users.value.find((entry) => entry.id === userId);
    if (!user) return;
    const base = buildMemberProfile(
      user as never,
      selectedServer.value?.id ?? 'echo',
      selectedServer.value?.name ?? 'Direct Messages',
      {
        memberJoinedAtIso: memberJoinedAtForSelectedServer(userId),
        serverImageUrl: selectedServer.value?.imageUrl,
      },
    );
    activeMemberProfile.value = applySessionPresenceToMemberProfile(
      base,
      echoSession.presenceByUserId[userId],
    );
    memberPopoutAnchor.value = anchorRect;
    isMemberPopoutOpen.value = true;
  }

  const activeMemberNote = computed(() => {
    const id = activeMemberProfile.value?.id;
    if (!id) return '';
    return profileNotes.value[id] ?? '';
  });

  const expandedProfileNote = computed(() => {
    const id =
      expandedProfileTargetUserId.value?.trim() ??
      expandedProfile.value?.id?.trim();
    if (!id) return '';
    return profileNotes.value[id] ?? '';
  });

  function updateProfileNote(userId: string | null, note: string) {
    if (!userId) return;
    const t = note.trim();
    const disk = loadProfileNotesMap();
    const next = { ...disk, ...profileNotes.value };
    if (!t) delete next[userId];
    else next[userId] = t;
    profileNotes.value = next;
    persistProfileNotesMap(next);
  }

  function openSelfProfile(anchorRect: PopoutAnchorRect | null = null) {
    selfProfileAnchor.value = anchorRect;
    isSelfProfilePopoutOpen.value = true;
  }

  function openExpandedProfileFromMemberPopout() {
    const profile = activeMemberProfile.value;
    const cur = currentUser.value;
    if (!profile || !cur) return;
    expandedProfileTargetUserId.value = profile.id;
    expandedProfile.value = buildExpandedProfile(
      profile,
      cur.id,
      expandedProfileInputs(),
    );
    isMemberPopoutOpen.value = false;
    isExpandedProfileModalOpen.value = true;
    isExpandedProfileSidePanel.value = false;
  }

  function openExpandedProfileFromSelfPopout() {
    const profile = selfProfile.value;
    const cur = currentUser.value;
    if (!profile || !cur) return;
    expandedProfileTargetUserId.value = profile.id;
    expandedProfile.value = buildExpandedProfile(
      profile,
      cur.id,
      expandedProfileInputs(),
    );
    isSelfProfilePopoutOpen.value = false;
    isExpandedProfileModalOpen.value = true;
    isExpandedProfileSidePanel.value = false;
  }

  function onExpandedProfileModalUpdate(open: boolean) {
    isExpandedProfileModalOpen.value = open;
    if (!open) {
      expandedProfile.value = null;
      expandedProfileTargetUserId.value = null;
    }
  }

  function openExpandedProfilePanelForUserId(userId: string) {
    if (!isInDMChat.value) return;
    if (!currentUser.value) return;
    const trimmed = userId.trim();
    if (!trimmed) return;
    if (
      isExpandedProfileModalOpen.value &&
      expandedProfile.value?.id === trimmed &&
      !expandedProfileLoading.value
    ) {
      closeExpandedProfileShell();
      return;
    }
    isMemberPopoutOpen.value = false;
    isSelfProfilePopoutOpen.value = false;
    isExpandedProfileSidePanel.value = canShowDmProfileSidePanel.value;
    isExpandedProfileModalOpen.value = true;
    isGroupOverviewOpen.value = false;
    rehydrateExpandedProfileForUserId(trimmed);
  }

  /** DM side profile overview → full-screen `ExpandedProfileModal` (same peer, richer layout). */
  function expandDmProfileToFullModal() {
    if (!expandedProfileTargetUserId.value && !expandedProfile.value) return;
    if (!isExpandedProfileModalOpen.value) return;
    isExpandedProfileSidePanel.value = false;
  }

  function handleExpandedProfileOpenProfile(userId: string) {
    if (isInDMChat.value) {
      openExpandedProfilePanelForUserId(userId);
      return;
    }
    const cur = currentUser.value;
    if (!cur) return;
    const trimmed = userId.trim();
    if (!trimmed) return;
    const user = users.value.find((u) => u.id === trimmed);
    if (!user) return;
    const baseProfile =
      trimmed === cur.id && selfProfile.value
        ? selfProfile.value
        : buildMemberProfile(
            user as never,
            selectedServer.value?.id ?? 'echo',
            selectedServer.value?.name ?? 'Direct Messages',
            {
              memberJoinedAtIso: memberJoinedAtForSelectedServer(trimmed),
              serverImageUrl: selectedServer.value?.imageUrl,
            },
          );
    isMemberPopoutOpen.value = false;
    isSelfProfilePopoutOpen.value = false;
    isExpandedProfileSidePanel.value = false;
    isGroupOverviewOpen.value = false;
    isExpandedProfileModalOpen.value = true;
    rehydrateExpandedProfileForUserId(trimmed);
    if (!expandedProfile.value) {
      expandedProfile.value = buildExpandedProfile(
        baseProfile,
        cur.id,
        expandedProfileInputs(),
      );
    }
  }

  function handleExpandedProfileOpenDM(
    userId: string,
    onSelectDM: (id: string) => void | Promise<unknown>,
    onSetDmRail: () => void,
  ) {
    closeExpandedProfileShell();
    isMemberPopoutOpen.value = false;
    isSelfProfilePopoutOpen.value = false;
    onSetDmRail();
    void onSelectDM(userId);
  }

  const isExpandedProfileFriend = computed(() => {
    const profile = expandedProfile.value;
    const pid = profile?.id?.trim();
    if (!pid) return false;
    if (friendIds.value.some((id) => id.trim() === pid)) return true;
    const me = currentUser.value?.id?.trim();
    if (!me) return false;
    const fromMap = friendIdsByUserId.value[me] ?? [];
    return fromMap.some((id) => id.trim() === pid);
  });

  return {
    openMemberProfile,
    activeMemberNote,
    expandedProfileNote,
    expandedProfileLoading,
    updateProfileNote,
    openSelfProfile,
    openExpandedProfileFromMemberPopout,
    openExpandedProfileFromSelfPopout,
    openExpandedProfilePanelForUserId,
    expandDmProfileToFullModal,
    handleExpandedProfileOpenProfile,
    handleExpandedProfileOpenDM,
    isExpandedProfileFriend,
    rehydrateExpandedProfileForUserId,
  };
}
