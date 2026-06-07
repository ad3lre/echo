import type { ChannelSummary, MessageWithAuthor } from '@shared/types';
import type { FilterChip, FilterKey, HasType } from '@/composables/useSearch';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { MemberRole, PopoutAnchorRect } from '@/utils/memberProfiles';
import type { MemberRoleManagementSpec } from '@/components/MemberList.vue';

/** Props / inject bundle for [`AppLayoutMembersColumn.vue`](./components/AppLayoutMembersColumn.vue). */
export type AppLayoutMembersColumnProps = {
  isVisible: boolean;
  effectiveActiveChannel: ChannelSummary | null;
  searchText: string;
  filterChips: FilterChip[];
  allChannels: Array<{ id: string; name: string }>;
  users: UserForAuthor[];
  paginatedSearchResults: (MessageWithAuthor & { channelName?: string })[];
  searchResultMessagesCount: number;
  searchResultPage: number;
  totalPages: number;
  selectedServerName: string;
  memberListUsers: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    isGuest?: boolean;
  }[];
  /** Echo: `echo_servers.owner_id` for the active guild (crown in member list). */
  serverOwnerId?: string | null;
  /** Sparse: friends on Echo Web from a phone-class device (compact badge). */
  presenceMobileByUserId?: Record<string, true>;
  /** Sparse: friends online on Discord (shows blue dot + coloring). */
  discordOnlineByUserId?: Record<string, true>;
  /** Sparse: user id -> ISO timestamp when they were last online. */
  lastOnlineAtByUserId?: Record<string, string>;
  selectedServerId: string;
  memberPanelCollapsed: boolean;
  /** When false (default), guest accounts are hidden from the roster toggle. */
  memberListShowGuests?: boolean;
  onUpdateMemberListShowGuests?: (show: boolean) => void;
  onSearchInput: (v: string) => void;
  addFilter: (key: FilterKey, value: string | boolean | HasType) => void;
  removeFilter: (key: FilterKey) => void;
  clearSearch: () => void;
  goToSearchPage: (page: number) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  onUpdateMemberPanelCollapsed: (next: boolean) => void;
  onOpenMemberProfile: (payload: {
    userId: string;
    anchorRect: PopoutAnchorRect | null;
    rolesPanel?: boolean;
    fromContextMenu?: boolean;
  }) => void;
  currentUserId?: string;
  canModerateMemberUser?: (userId: string) => boolean;
  canModerateMemberAction?: (
    userId: string,
    action: 'kick' | 'ban' | 'timeout',
  ) => boolean;
  onModerateMemberUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  canChangeMemberNickname?: (userId: string) => boolean;
  onChangeMemberNickname?: (userId: string) => void;
  onMessageMemberUser?: (userId: string) => void;
  resolveHighestRole?: (userId: string) => MemberRole | undefined;
  roleManagement?: MemberRoleManagementSpec;
  memberListLoading?: boolean;
  echoMemberSectionOrdering?: boolean;
  searchLoading?: boolean;
  searchError?: string | null;
  searchScopeHint?: string;
};
