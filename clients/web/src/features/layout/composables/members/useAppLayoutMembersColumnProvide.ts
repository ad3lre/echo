import {
  computed,
  provide,
  unref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  LAYOUT_MEMBERS_COLUMN_KEY,
  type LayoutMembersColumnContext,
} from '@/features/layout/layoutInjectionKeys';
import { memberPanelDiag } from '@/features/layout/composables/members/memberPanelDiag';
import type { ChannelSummary } from '@shared/types';
import type { PopoutAnchorRect } from '@/features/member-profile/memberProfiles';

type RV<T> = Ref<T> | ComputedRef<T>;
type Ctx = LayoutMembersColumnContext;

export type AppLayoutMembersColumnProvideDeps = {
  membersColumnVisible: Ctx['isVisible'];
  effectiveActiveChannel: RV<ChannelSummary | null>;
  searchText: Ctx['searchText'];
  filterChips: Ctx['filterChips'];
  allChannels: Ctx['allChannels'];
  usersForMentionAutocomplete: Ctx['users'];
  paginatedSearchResults: Ctx['paginatedSearchResults'];
  searchResultMessages: RV<unknown[]>;
  searchResultPage: Ctx['searchResultPage'];
  totalPages: Ctx['totalPages'];
  selectedServer: {
    value: { id?: string; name?: string; ownerId?: string } | null | undefined;
  };
  serverStore: {
    selectedServerId?: string | null;
    selectedServer?: { id?: string } | null;
  };
  memberListUsersResolved: Ctx['memberListUsers'];
  memberListUsers: RV<unknown[]>;
  presenceMobileByUserId: Ctx['presenceMobileByUserId'];
  memberPanelCollapsed: Ref<boolean>;
  memberListShowGuests: Ref<boolean>;
  onSearchInput: Ctx['onSearchInput'];
  addFilter: Ctx['addFilter'];
  removeFilter: Ctx['removeFilter'];
  clearSearch: Ctx['clearSearch'];
  goToSearchPage: Ctx['goToSearchPage'];
  handleGoToMessage: Ctx['handleGoToMessage'];
  searchLoading: Ctx['searchLoading'];
  searchError: Ctx['searchError'];
  searchScopeHint: Ctx['searchScopeHint'];
  markMemberPanelCollapsedByUser: () => void;
  markMemberPanelExpandedByUser: () => void;
  isCompactShell: RV<boolean>;
  hasGuildChannelChrome: RV<boolean>;
  compactPagerPane: Ref<0 | 1 | 2>;
  openMemberProfileFromMemberColumn: (payload: {
    userId: string;
    anchorRect: PopoutAnchorRect | null;
    rolesPanel?: boolean;
    fromContextMenu?: boolean;
  }) => void;
  currentUser: RV<{ id?: string } | null | undefined>;
  canModerateMemberInServer: Ctx['canModerateMemberUser'];
  canModerateMemberActionInServer: Ctx['canModerateMemberAction'];
  handleModerateUser: Ctx['onModerateMemberUser'];
  canChangeMemberNicknameInServer: Ctx['canChangeMemberNickname'];
  handleChangeMemberNicknameFromMemberList: Ctx['onChangeMemberNickname'];
  selectDM: Ctx['onMessageMemberUser'];
  memberListResolveHighestRoleResolved: Ctx['resolveHighestRole'];
  memberListRoleManagement: Ctx['roleManagement'];
  membersColumnListLoading: Ctx['memberListLoading'];
  membersColumnEchoSectionOrdering: Ctx['echoMemberSectionOrdering'];
  isEchoServerRoleHierarchyPending: RV<boolean>;
  echoCapabilitiesForServerId: RV<string | null | undefined>;
  isExploreView: RV<boolean>;
  memberPanelCollapsedEffective: RV<boolean>;
  isDmUiContext: RV<boolean>;
  isServerEmptyOnboarding: RV<boolean>;
  isViewingVoiceChannel: RV<boolean>;
  serverVoiceSurfaceActive: RV<boolean>;
  callOverlay: RV<{ type: string }>;
  isMemberSurfaceSwitchLoading: RV<boolean>;
  workspaceServerMemberIds: RV<Record<string, unknown[] | undefined>>;
};

function assembleMembersColumnContext(deps: AppLayoutMembersColumnProvideDeps) {
  return {
    isVisible: deps.membersColumnVisible,
    effectiveActiveChannel: deps.effectiveActiveChannel,
    searchText: deps.searchText,
    filterChips: deps.filterChips,
    allChannels: deps.allChannels,
    users: deps.usersForMentionAutocomplete,
    paginatedSearchResults: deps.paginatedSearchResults,
    searchResultMessagesCount: computed(
      () => unref(deps.searchResultMessages).length,
    ),
    searchResultPage: deps.searchResultPage,
    totalPages: deps.totalPages,
    selectedServerName: computed(() => deps.selectedServer.value?.name ?? ''),
    memberListUsers: deps.memberListUsersResolved,
    presenceMobileByUserId: deps.presenceMobileByUserId,
    selectedServerId: computed(
      () =>
        deps.serverStore.selectedServerId ??
        deps.selectedServer.value?.id ??
        'echo',
    ),
    serverOwnerId: computed(() => {
      const id = deps.selectedServer.value?.ownerId?.trim();
      return id || null;
    }),
    memberPanelCollapsed: deps.memberPanelCollapsed,
    memberListShowGuests: deps.memberListShowGuests,
    onUpdateMemberListShowGuests: (show: boolean) => {
      deps.memberListShowGuests.value = show;
    },
    ...assembleMembersColumnHandlers(deps),
  };
}

function assembleMembersColumnHandlers(
  deps: AppLayoutMembersColumnProvideDeps,
) {
  return {
    onSearchInput: deps.onSearchInput,
    addFilter: deps.addFilter,
    removeFilter: deps.removeFilter,
    clearSearch: deps.clearSearch,
    goToSearchPage: deps.goToSearchPage,
    handleGoToMessage: deps.handleGoToMessage,
    searchLoading: deps.searchLoading,
    searchError: deps.searchError,
    searchScopeHint: deps.searchScopeHint,
    onUpdateMemberPanelCollapsed: (next: boolean) => {
      deps.memberPanelCollapsed.value = next;
      if (next) deps.markMemberPanelCollapsedByUser();
      else deps.markMemberPanelExpandedByUser();
      if (
        next &&
        unref(deps.isCompactShell) &&
        unref(deps.hasGuildChannelChrome) &&
        deps.compactPagerPane.value === 2
      ) {
        deps.compactPagerPane.value = 1;
      }
    },
    compactGuildMembersPaneFocused: computed(
      () =>
        unref(deps.isCompactShell) &&
        unref(deps.hasGuildChannelChrome) &&
        deps.compactPagerPane.value === 2,
    ),
    onOpenMemberProfile: (
      payload: Parameters<typeof deps.openMemberProfileFromMemberColumn>[0],
    ) => deps.openMemberProfileFromMemberColumn(payload),
    currentUserId: computed(() => unref(deps.currentUser)?.id),
    canModerateMemberUser: deps.canModerateMemberInServer,
    canModerateMemberAction: deps.canModerateMemberActionInServer,
    onModerateMemberUser: deps.handleModerateUser,
    canChangeMemberNickname: deps.canChangeMemberNicknameInServer,
    onChangeMemberNickname: deps.handleChangeMemberNicknameFromMemberList,
    onMessageMemberUser: deps.selectDM,
    resolveHighestRole: deps.memberListResolveHighestRoleResolved,
    roleManagement: deps.memberListRoleManagement,
    memberListLoading: deps.membersColumnListLoading,
    echoMemberSectionOrdering: deps.membersColumnEchoSectionOrdering,
  };
}

function watchMembersColumnDiag(deps: AppLayoutMembersColumnProvideDeps) {
  watch(
    () => ({
      membersColumnVisible: unref(deps.membersColumnVisible),
      resolvedMemberCount: unref(deps.memberListUsersResolved).length,
      rawMemberCount: unref(deps.memberListUsers).length,
      roleHierarchyPending: unref(deps.isEchoServerRoleHierarchyPending),
      echoCapabilitiesForServerId: unref(deps.echoCapabilitiesForServerId),
      selectedServerId: deps.serverStore.selectedServer?.id ?? null,
      isExploreView: unref(deps.isExploreView),
      memberPanelCollapsedEffective: unref(deps.memberPanelCollapsedEffective),
      memberPanelCollapsedRaw: unref(deps.memberPanelCollapsed),
      isDmUiContext: unref(deps.isDmUiContext),
      isServerEmptyOnboarding: unref(deps.isServerEmptyOnboarding),
      isViewingVoiceChannel: unref(deps.isViewingVoiceChannel),
      serverVoiceSurfaceActive: unref(deps.serverVoiceSurfaceActive),
      callOverlayType: unref(deps.callOverlay).type,
      isMemberSurfaceSwitchLoading: unref(deps.isMemberSurfaceSwitchLoading),
      membersColumnListLoading: unref(deps.membersColumnListLoading),
      effectiveActiveChannelId: unref(deps.effectiveActiveChannel)?.id ?? null,
      serverMemberIdsLen:
        unref(deps.workspaceServerMemberIds)[
          deps.serverStore.selectedServer?.id ?? ''
        ]?.length ?? null,
    }),
    (v) => {
      memberPanelDiag('AppLayout:gates', v as Record<string, unknown>);
    },
    { flush: 'post' },
  );
}

/**
 * Members column + search chrome. Consumed via inject(LAYOUT_MEMBERS_COLUMN_KEY).
 */
export function useAppLayoutMembersColumnProvide(
  deps: AppLayoutMembersColumnProvideDeps,
) {
  provide(
    LAYOUT_MEMBERS_COLUMN_KEY,
    assembleMembersColumnContext(deps) as LayoutMembersColumnContext,
  );
  watchMembersColumnDiag(deps);
}
