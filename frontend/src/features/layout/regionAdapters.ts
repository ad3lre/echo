import type { ComputedRef } from 'vue';
import type { ExpandedProfile } from '@/utils/memberProfiles';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import type { DmSubView } from '@/features/layout/mainSurface';

export type DmSurfaceUser = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
};

export type DmSurfaceGroup = {
  id: string;
  name: string;
  pfp?: string;
  description?: string;
};

export type ProfileSurfaceModel = {
  currentUserId?: string;
  expandedProfile: ExpandedProfile | null;
  expandedProfileLoading?: boolean;
  expandedProfileNote: string;
  isExpandedProfileSidePanel: boolean;
  isExpandedProfileModalOpen: boolean;
  isExpandedProfileTargetBlocked: boolean;
  friendshipKnown: boolean;
  friendIds: string[];
  friendIdsByUserId: Record<string, string[]>;
  friendRequestsIncoming: { id?: string; fromUserId: string }[];
  friendRequestsOutgoing: { id?: string; toUserId: string }[];
  blockedUserIds: string[];
  guestFriendsLocked: boolean;
  presenceByUserId?: Record<string, string | undefined>;
  presenceMobileByUserId?: Record<string, true>;
  hideOpenDmButton: boolean;
};

export type ProfileSurfaceIntents = {
  updateNote: (note: string) => void;
  setModalOpen: (next: boolean) => void;
  openServer: (serverId: string) => void;
  openProfile: (userId: string) => void;
  expandProfileModal: () => void;
  openDm: (userId: string) => void;
  sendFriendRequest: (userId: string) => void;
  cancelOutgoingFriendRequest: (userId: string) => void;
  acceptIncomingFriendRequest?: (userId: string) => void;
  declineIncomingFriendRequest?: (userId: string) => void;
  removeFriend: (userId: string) => void | Promise<void>;
  blockUser: (userId: string) => void | Promise<void>;
  unblockUser: (userId: string) => void | Promise<void>;
  reportUser: (payload: {
    userId: string;
    reason: string;
  }) => void | Promise<void>;
};

export type DmSurfaceModel = {
  partnerUser: DmSurfaceUser | null;
  activeGroupDm: DmSurfaceGroup | null;
  activeDmThreadCallUi: ActiveDmThreadCallUi | null;
  isGroupDM: boolean;
  isInDMMode: boolean;
  isInDMChat: boolean;
  dmActiveTab: DmSubView;
  presenceByUserId: Record<string, string | undefined>;
  presenceMobileByUserId?: Record<string, true>;
  activeGroupCallMembers: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
  }[];
};

export type DmSurfaceIntents = {
  openProfilePanelForUserId: (userId: string) => void;
  openProfileModal: (userId: string) => void;
  openGroupOverviewPanel: (groupId?: string) => void;
  openGroupSettingsFromHeader: (focus?: 'name' | 'icon') => void;
};

export type ChatHeaderModel = {
  dm: DmSurfaceModel;
  profile: Pick<
    ProfileSurfaceModel,
    | 'isExpandedProfileSidePanel'
    | 'isExpandedProfileModalOpen'
    | 'currentUserId'
  >;
};

export type ChatHeaderIntents = {
  openProfilePanelForUserId: DmSurfaceIntents['openProfilePanelForUserId'];
  openProfileModal: DmSurfaceIntents['openProfileModal'];
  openGroupOverviewPanel: DmSurfaceIntents['openGroupOverviewPanel'];
  openGroupSettingsFromHeader: DmSurfaceIntents['openGroupSettingsFromHeader'];
};

export type DmSurfaceAdapter = {
  model: ComputedRef<DmSurfaceModel>;
  intents: DmSurfaceIntents;
};

export type ProfileSurfaceAdapter = {
  model: ComputedRef<ProfileSurfaceModel>;
  intents: ProfileSurfaceIntents;
};

export type ChatHeaderAdapter = {
  model: ComputedRef<ChatHeaderModel>;
  intents: ChatHeaderIntents;
};
