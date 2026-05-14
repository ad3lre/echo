import type { Ref } from 'vue';
import type {
  MemberProfile,
  PopoutAnchorRect,
  ExpandedProfile,
} from '@/utils/memberProfiles';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import type { ChannelCategory } from '@/composables/useChannels';
import type { ProfileSurfaceAdapter } from '@/features/layout/regionAdapters';
import type { EchoRoleCategoryDto } from '@/api/echo/types';

export type AppLayoutDiscoverableServer = {
  id?: string;
  name: string;
  pfp: string;
};

export type AppLayoutModalsMemberRoleManagementSpec = {
  enabled: boolean;
  assignableRoles: {
    id: string;
    name: string;
    color: string;
    darkColor?: string;
    lightColor?: string;
    separateThemeColors?: boolean;
    isEveryone?: boolean;
    position?: number;
    roleCategoryId?: string | null;
  }[];
  roleCategories?: EchoRoleCategoryDto[];
  canMutateMemberRole?: (
    targetUserId: string,
    roleId: string,
    assign: boolean,
  ) => boolean;
  busy?: boolean;
  resolveAssignedRoleIds: (userId: string) => string[];
  onToggleRole: (payload: {
    targetUserId: string;
    roleId: string;
    assign: boolean;
  }) => void | Promise<void>;
};

/** Props / inject bundle for [`AppLayoutModals.vue`](./components/AppLayoutModals.vue). */
export type AppLayoutModalsProps = {
  profileSurfaceAdapter?: ProfileSurfaceAdapter;
  currentUser: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    customStatus?: string;
    bannerImage?: string;
    bannerColor?: string;
    bannerRefractionEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
  } | null;
  onOpenSettingsFromProfileBar: () => void;
  isAuthModalOpen: boolean;
  authModalInitialLoginEntry?: 'social' | 'echo';
  authModalPasskeyOnOpen?: boolean;
  authModalInitialTab?: 'login' | 'register';
  authModalInitialSubView?: null | 'forgot';
  onUpdateAuthModal: (next: boolean) => void;
  isAddServerModalOpen: boolean;
  addServerInitialView: 'initial' | 'create' | 'join';
  canImportDiscord?: boolean;
  discoverableServers:
    | AppLayoutDiscoverableServer[]
    | Ref<AppLayoutDiscoverableServer[]>;
  onUpdateAddServerModal: (next: boolean) => void;
  onRequestDiscordLinkFromAddServer?: () => void;
  onServerEmptyOpenInvite?: () => void;
  onCreateServer: (payload: {
    name: string;
    importFromDiscord?: boolean;
    iconUrl?: string;
    iconFile?: File;
  }) => void;
  onJoinDiscoverableServer: (payload: {
    id?: string;
    name: string;
    pfp: string;
  }) => void;
  onJoinWithInviteLink: (raw: string) => void;
  addServerJoinError?: string;
  /** True while the server is being created / Discord import is running after submit. */
  addServerCreateBusy?: boolean;
  isInviteModalOpen: boolean;
  selectedServerName: string;
  inviteLink: string;
  inviteLinkLookupPending?: boolean;
  /** When set, invite link includes `?voice=` and the modal shows a voice invite card. */
  inviteModalVoiceChannelId?: string | null;
  inviteModalVoiceChannelName?: string | null;
  inviteableFriends: { id: string; name: string; pfp: string }[];
  onUpdateInviteModal: (next: boolean) => void;
  onInviteFriend: (
    userId: string,
    voiceChannelId?: string | null,
    voiceChannelName?: string | null,
  ) => void;
  isServerSettingsModalOpen: boolean;
  selectedServerForSettings: {
    id: string;
    name: string;
    imageUrl: string;
    bannerImageUrl?: string;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    ownerId?: string;
  } | null;
  memberListUsers: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    isDiscordShadow?: boolean;
    isGuest?: boolean;
  }[];
  /** Server Settings → Members: full roster including Discord import placeholders (`isDiscordShadow`). */
  serverSettingsMemberUsers: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    isDiscordShadow?: boolean;
    isGuest?: boolean;
  }[];
  resolveMemberHighestRole?: (
    userId: string,
  ) => { name: string; color?: string } | null | undefined;
  canModerateMemberAction?: (
    targetUserId: string,
    action: 'kick' | 'ban' | 'timeout',
  ) => boolean;
  onRequestModerateMember?: (payload: {
    targetUserId: string;
    action: 'kick' | 'ban' | 'timeout';
  }) => void;
  onUpdateServerSettingsModal: (next: boolean) => void;
  serverSettingsModalInitialSection?: ServerSettingsSection | null;
  onUpdateServerSettingsModalActiveSection?: (
    section: ServerSettingsSection,
  ) => void;
  serverSettingsCanManageRoles?: boolean;
  serverSettingsCanManageServer?: boolean;
  deleteServerEnabled?: boolean;
  onEchoWorkspaceRefresh?: () => void;
  onEchoRoleCatalogRefresh?: () => void;
  onServerDeleted?: (serverId: string) => void;
  onPreviewRoleFromSettings?: (payload: {
    serverId: string;
    roleId: string;
    roleName: string;
    roleColor: string;
    uiPermissions: string[];
  }) => void;
  /** Echo: Server Settings → Structure tab (MANAGE_CHANNELS / create-channel capability). */
  serverSettingsGuildStructureEnabled?: boolean;
  serverSettingsStructureCategories?:
    | ChannelCategory[]
    | import('vue').Ref<ChannelCategory[]>;
  serverSettingsOnChannelReorder?: (payload: {
    channelId: string;
    targetCategoryId: string | null;
    siblingIndex: number;
  }) => void | Promise<void>;
  serverSettingsOnCategoryReorder?: (payload: {
    categoryId: string;
    siblingIndex: number;
  }) => void | Promise<void>;
  /** Echo: selected server is a Discord import — show Server Settings → Discord tab. */
  serverSettingsIsDiscordImportedServer?: boolean;
  isGroupDmSettingsOpen: boolean;
  groupDmSettingsInitialFocus: 'name' | 'icon' | null;
  groupSettingsId: string;
  groupSettingsName: string;
  groupSettingsPfp: string;
  groupSettingsMembers: { id: string; name: string; pfp: string }[];
  onUpdateGroupDmSettingsOpen: (next: boolean) => void;
  onUpdateGroupFromSettings: (payload: { name: string; pfp: string }) => void;
  onRemoveGroupDmMember: (payload: { groupId: string; userId: string }) => void;
  onLeaveGroupDm: (payload: { groupId: string }) => void | Promise<void>;
  onOpenAddMembersToGroupDm: () => void;
  isGroupDmModalOpen: boolean;
  dmGroupFriends: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
  }[];
  groupDmPreselectedIds: string[];
  groupDmLockedIds: string[];
  groupDmMaxMembers?: number;
  onUpdateGroupDmModal: (next: boolean) => void;
  onCreateGroupDm: (payload: { name: string; memberIds: string[] }) => void;
  isSettingsModalOpen: boolean;
  settingsModalInitialSection: SettingsSection | null;
  onUpdateSettingsModal: (next: boolean) => void;
  onUpdateSettingsModalActiveSection?: (section: SettingsSection) => void;
  onSettingsGuestUpgraded?: () => void | Promise<void>;
  onSettingsGuestSignInExisting?: () => void;
  /** When true (DM rail / inbox), member quick profile hides guild-only chrome such as ROLES. */
  isDmUiContext?: boolean;
  isMemberPopoutOpen: boolean;
  isMemberPopoutFriend?: boolean;
  isMemberPopoutCanSendFriendRequest?: boolean;
  activeMemberProfile: MemberProfile | null;
  memberPopoutAnchor: PopoutAnchorRect | null;
  activeMemberNote: string;
  memberListRoleManagement?: AppLayoutModalsMemberRoleManagementSpec;
  memberPopoutOpenRolesPanel?: boolean;
  onUpdateMemberPopoutOpen: (next: boolean) => void;
  onUpdateMemberNote: (note: string) => void;
  onOpenExpandedProfileFromMemberPopout: () => void;
  onMemberPopoutQuickDm?: (payload: { userId: string; text: string }) => void;
  onMemberPopoutOpenDm?: (userId: string) => void;
  onMemberPopoutSendFriendRequest?: (userId: string) => void;
  isSelfProfilePopoutOpen: boolean;
  selfProfile: MemberProfile | null;
  selfProfileAnchor: PopoutAnchorRect | null;
  customStatus: string;
  onUpdateSelfProfilePopoutOpen: (next: boolean) => void;
  onUpdateCustomStatus: (next: string) => void;
  onUpdateCurrentUserStatus: (
    status: 'online' | 'idle' | 'do_not_disturb' | 'offline',
  ) => void;
  onOpenExpandedProfileFromSelfPopout: () => void;
  isExpandedProfileSidePanel: boolean;
  isExpandedProfileModalOpen: boolean;
  expandedProfile: ExpandedProfile | null;
  isExpandedProfileFriend: boolean;
  isExpandedProfileOutgoingRequest: boolean;
  /** When false, friendship state is not yet authoritative (avoid showing wrong actions). */
  friendshipKnown: boolean;
  /** Full friendship graph inputs (single authority). */
  friendIds?: string[];
  friendRequestsIncoming?: { id: string; fromUserId: string }[];
  friendRequestsOutgoing?: { id: string; toUserId: string }[];
  blockedUserIds?: string[];
  friendIdsByUserId?: Record<string, string[]>;
  isExpandedProfileTargetBlocked: boolean;
  guestFriendsLocked?: boolean;
  /**
   * When true, hide the DM/Message affordance in the expanded profile chrome because
   * the user is already in a 1:1 DM with this peer.
   */
  expandedProfileHideOpenDmButton?: boolean;
  expandedProfilePresenceByUserId?: Record<string, string | undefined>;
  expandedProfilePresenceMobileByUserId?: Record<string, true>;
  expandedProfileNote: string;
  onUpdateExpandedProfileNote: (note: string) => void;
  onExpandedProfileModalUpdate: (next: boolean) => void;
  /** Own expanded profile → Settings Profile tab. */
  onOpenEditProfileFromExpandedProfile?: () => void;
  onExpandedProfileOpenServer: (serverId: string) => void;
  onExpandedProfileOpenProfile: (userId: string) => void;
  onExpandedProfileOpenDm: (userId: string) => void;
  onExpandedProfileSendFriendRequest: (userId: string) => void;
  onExpandedProfileCancelOutgoingFriendRequest: (userId: string) => void;
  onExpandedProfileAcceptIncomingFriendRequest?: (userId: string) => void;
  onExpandedProfileDeclineIncomingFriendRequest?: (userId: string) => void;
  onExpandedProfileRemoveFriend: (userId: string) => void | Promise<void>;
  isMemberPopoutTargetBlocked: boolean;
  currentUserIdForProfiles?: string;
  onProfileBlockUser: (userId: string) => void | Promise<void>;
  onProfileUnblockUser: (userId: string) => void | Promise<void>;
  onProfileReportUser: (payload: {
    userId: string;
    reason: string;
  }) => void | Promise<void>;
  moderationModalOpen: boolean;
  moderationAction: 'kick' | 'ban' | 'timeout' | 'untimeout' | null;
  moderationTargetUser: { name: string; pfp?: string } | null;
  moderationServerName: string;
  /** Echo server + Manage Messages: show “delete recent messages” on ban modal. */
  moderationCanPurgeBanMessages?: boolean;
  onUpdateModerationModalOpen: (next: boolean) => void;
  onModerationModalConfirm: (
    payload?:
      | { timeoutMinutes: number }
      | {
          banDurationMinutes: number | null;
          reason: string;
          deleteRecentMessagesHours?: number;
        },
  ) => void;
  isLeaveServerModalOpen: boolean;
  leaveServerModalVariant: 'confirm' | 'ownerBlocked';
  leaveServerModalServerName: string;
  onUpdateLeaveServerModal: (next: boolean) => void;
  onLeaveServerModalConfirm: () => void;
};

export const MODALS_INJECT_KEYS = [
  'profileSurfaceAdapter',
  'currentUser',
  'onOpenSettingsFromProfileBar',
  'isAuthModalOpen',
  'authModalInitialLoginEntry',
  'authModalPasskeyOnOpen',
  'authModalInitialTab',
  'authModalInitialSubView',
  'onUpdateAuthModal',
  'isAddServerModalOpen',
  'addServerInitialView',
  'canImportDiscord',
  'discoverableServers',
  'onUpdateAddServerModal',
  'onRequestDiscordLinkFromAddServer',
  'onServerEmptyOpenInvite',
  'onCreateServer',
  'onJoinDiscoverableServer',
  'onJoinWithInviteLink',
  'addServerJoinError',
  'addServerCreateBusy',
  'isInviteModalOpen',
  'selectedServerName',
  'inviteLink',
  'inviteLinkLookupPending',
  'inviteModalVoiceChannelId',
  'inviteModalVoiceChannelName',
  'inviteableFriends',
  'onUpdateInviteModal',
  'onInviteFriend',
  'isServerSettingsModalOpen',
  'selectedServerForSettings',
  'memberListUsers',
  'serverSettingsMemberUsers',
  'resolveMemberHighestRole',
  'canModerateMemberAction',
  'onRequestModerateMember',
  'onUpdateServerSettingsModal',
  'serverSettingsModalInitialSection',
  'onUpdateServerSettingsModalActiveSection',
  'serverSettingsCanManageRoles',
  'serverSettingsCanManageServer',
  'deleteServerEnabled',
  'onEchoWorkspaceRefresh',
  'onEchoRoleCatalogRefresh',
  'onServerDeleted',
  'onPreviewRoleFromSettings',
  'serverSettingsGuildStructureEnabled',
  'serverSettingsStructureCategories',
  'serverSettingsOnChannelReorder',
  'serverSettingsOnCategoryReorder',
  'serverSettingsIsDiscordImportedServer',
  'isGroupDmSettingsOpen',
  'groupDmSettingsInitialFocus',
  'groupSettingsId',
  'groupSettingsName',
  'groupSettingsPfp',
  'groupSettingsMembers',
  'onUpdateGroupDmSettingsOpen',
  'onUpdateGroupFromSettings',
  'onRemoveGroupDmMember',
  'onLeaveGroupDm',
  'onOpenAddMembersToGroupDm',
  'isGroupDmModalOpen',
  'dmGroupFriends',
  'groupDmPreselectedIds',
  'groupDmLockedIds',
  'groupDmMaxMembers',
  'onUpdateGroupDmModal',
  'onCreateGroupDm',
  'isSettingsModalOpen',
  'settingsModalInitialSection',
  'onUpdateSettingsModal',
  'onUpdateSettingsModalActiveSection',
  'onSettingsGuestUpgraded',
  'onSettingsGuestSignInExisting',
  'isDmUiContext',
  'isMemberPopoutOpen',
  'isMemberPopoutFriend',
  'isMemberPopoutCanSendFriendRequest',
  'activeMemberProfile',
  'memberPopoutAnchor',
  'activeMemberNote',
  'memberListRoleManagement',
  'memberPopoutOpenRolesPanel',
  'onUpdateMemberPopoutOpen',
  'onUpdateMemberNote',
  'onOpenExpandedProfileFromMemberPopout',
  'onMemberPopoutQuickDm',
  'onMemberPopoutOpenDm',
  'onMemberPopoutSendFriendRequest',
  'isSelfProfilePopoutOpen',
  'selfProfile',
  'selfProfileAnchor',
  'customStatus',
  'onUpdateSelfProfilePopoutOpen',
  'onUpdateCustomStatus',
  'onUpdateCurrentUserStatus',
  'onOpenExpandedProfileFromSelfPopout',
  'isExpandedProfileSidePanel',
  'isExpandedProfileModalOpen',
  'expandedProfile',
  'isExpandedProfileFriend',
  'isExpandedProfileOutgoingRequest',
  'friendshipKnown',
  'friendIds',
  'friendRequestsIncoming',
  'friendRequestsOutgoing',
  'blockedUserIds',
  'friendIdsByUserId',
  'isExpandedProfileTargetBlocked',
  'guestFriendsLocked',
  'expandedProfileHideOpenDmButton',
  'expandedProfilePresenceByUserId',
  'expandedProfilePresenceMobileByUserId',
  'expandedProfileNote',
  'onUpdateExpandedProfileNote',
  'onExpandedProfileModalUpdate',
  'onOpenEditProfileFromExpandedProfile',
  'onExpandedProfileOpenServer',
  'onExpandedProfileOpenProfile',
  'onExpandedProfileOpenDm',
  'onExpandedProfileSendFriendRequest',
  'onExpandedProfileCancelOutgoingFriendRequest',
  'onExpandedProfileAcceptIncomingFriendRequest',
  'onExpandedProfileDeclineIncomingFriendRequest',
  'onExpandedProfileRemoveFriend',
  'isMemberPopoutTargetBlocked',
  'currentUserIdForProfiles',
  'onProfileBlockUser',
  'onProfileUnblockUser',
  'onProfileReportUser',
  'moderationModalOpen',
  'moderationAction',
  'moderationTargetUser',
  'moderationServerName',
  'moderationCanPurgeBanMessages',
  'onUpdateModerationModalOpen',
  'onModerationModalConfirm',
  'isLeaveServerModalOpen',
  'leaveServerModalVariant',
  'leaveServerModalServerName',
  'onUpdateLeaveServerModal',
  'onLeaveServerModalConfirm',
] as const satisfies ReadonlyArray<keyof AppLayoutModalsProps>;
