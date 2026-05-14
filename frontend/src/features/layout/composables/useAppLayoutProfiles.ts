import { computed, type Ref } from 'vue';
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
    const id = expandedProfile.value?.id;
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
    expandedProfile.value = buildExpandedProfile(profile, cur.id, {
      servers: servers.value as ExpandedProfileInputs['servers'],
      users: users.value as ExpandedProfileInputs['users'],
      serverMemberIds: serverMemberIds.value,
      friendIdsByUserId: friendIdsByUserId.value,
    });
    isMemberPopoutOpen.value = false;
    isExpandedProfileModalOpen.value = true;
    isExpandedProfileSidePanel.value = false;
  }

  function openExpandedProfileFromSelfPopout() {
    const profile = selfProfile.value;
    const cur = currentUser.value;
    if (!profile || !cur) return;
    expandedProfile.value = buildExpandedProfile(profile, cur.id, {
      servers: servers.value as ExpandedProfileInputs['servers'],
      users: users.value as ExpandedProfileInputs['users'],
      serverMemberIds: serverMemberIds.value,
      friendIdsByUserId: friendIdsByUserId.value,
    });
    isSelfProfilePopoutOpen.value = false;
    isExpandedProfileModalOpen.value = true;
    isExpandedProfileSidePanel.value = false;
  }

  function onExpandedProfileModalUpdate(open: boolean) {
    isExpandedProfileModalOpen.value = open;
    if (!open) expandedProfile.value = null;
  }

  function openExpandedProfilePanelForUserId(userId: string) {
    if (!isInDMChat.value) return;
    const cur = currentUser.value;
    if (!cur) return;
    if (
      isExpandedProfileModalOpen.value &&
      expandedProfile.value?.id === userId
    ) {
      isExpandedProfileModalOpen.value = false;
      expandedProfile.value = null;
      isExpandedProfileSidePanel.value = false;
      return;
    }
    const user = users.value.find((u) => u.id === userId);
    if (!user) return;
    const memberProfile = buildMemberProfile(
      user as never,
      selectedServer.value?.id ?? 'echo',
      selectedServer.value?.name ?? 'Direct Messages',
      {
        memberJoinedAtIso: memberJoinedAtForSelectedServer(userId),
        serverImageUrl: selectedServer.value?.imageUrl,
      },
    );
    expandedProfile.value = buildExpandedProfile(memberProfile, cur.id, {
      servers: servers.value as ExpandedProfileInputs['servers'],
      users: users.value as ExpandedProfileInputs['users'],
      serverMemberIds: serverMemberIds.value,
      friendIdsByUserId: friendIdsByUserId.value,
    });
    isMemberPopoutOpen.value = false;
    isSelfProfilePopoutOpen.value = false;
    isExpandedProfileSidePanel.value = canShowDmProfileSidePanel.value;
    isExpandedProfileModalOpen.value = true;
    isGroupOverviewOpen.value = false;
  }

  /** DM side profile overview → full-screen `ExpandedProfileModal` (same peer, richer layout). */
  function expandDmProfileToFullModal() {
    if (!expandedProfile.value) return;
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
    const user = users.value.find((u) => u.id === userId);
    if (!user) return;
    const baseProfile =
      userId === cur.id && selfProfile.value
        ? selfProfile.value
        : buildMemberProfile(
            user as never,
            selectedServer.value?.id ?? 'echo',
            selectedServer.value?.name ?? 'Direct Messages',
            {
              memberJoinedAtIso: memberJoinedAtForSelectedServer(userId),
              serverImageUrl: selectedServer.value?.imageUrl,
            },
          );
    expandedProfile.value = buildExpandedProfile(baseProfile, cur.id, {
      servers: servers.value as ExpandedProfileInputs['servers'],
      users: users.value as ExpandedProfileInputs['users'],
      serverMemberIds: serverMemberIds.value,
      friendIdsByUserId: friendIdsByUserId.value,
    });
    isMemberPopoutOpen.value = false;
    isSelfProfilePopoutOpen.value = false;
    isExpandedProfileSidePanel.value = false;
    isGroupOverviewOpen.value = false;
    isExpandedProfileModalOpen.value = true;
  }

  function handleExpandedProfileOpenDM(
    userId: string,
    onSelectDM: (id: string) => void | Promise<unknown>,
    onSetDmRail: () => void,
  ) {
    isExpandedProfileModalOpen.value = false;
    expandedProfile.value = null;
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
    updateProfileNote,
    openSelfProfile,
    openExpandedProfileFromMemberPopout,
    openExpandedProfileFromSelfPopout,
    onExpandedProfileModalUpdate,
    openExpandedProfilePanelForUserId,
    expandDmProfileToFullModal,
    handleExpandedProfileOpenProfile,
    handleExpandedProfileOpenDM,
    isExpandedProfileFriend,
  };
}
