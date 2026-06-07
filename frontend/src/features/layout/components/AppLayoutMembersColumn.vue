<script setup lang="ts">
import { computed, inject, unref, watch } from 'vue';
import type { MaybeRef } from 'vue';
import MemberList from '@/components/MemberList.vue';
import SearchBar from '@/components/chat/SearchBar.vue';
import { APP_LAYOUT_SEARCH_PANEL_KEY } from '@/features/layout/chatSurfaceContext';
import { LAYOUT_MEMBERS_COLUMN_KEY } from '@/features/layout/layoutInjectionKeys';
import type { AppLayoutMembersColumnProps } from '@/features/layout/appLayoutMembersColumnProps';
import { layoutHyperLog } from '@/utils/layoutHyperLog';
import type { FilterKey, HasType } from '@/composables/useSearch';
import {
  countMemberListGuests,
  filterMemberListUsersForPanel,
} from '@/utils/memberListGuestFilter';

/** Props optional when `LAYOUT_MEMBERS_COLUMN_KEY` is provided from `AppLayout`. */
const props = defineProps<
  Partial<AppLayoutMembersColumnProps> & {
    /**
     * When set, replaces inject-driven `isVisible` (compact tri-pane members surface).
     */
    visibilityOverride?: boolean | null;
  }
>();

const layoutMembers = inject(LAYOUT_MEMBERS_COLUMN_KEY, null);

function pick<K extends keyof AppLayoutMembersColumnProps>(key: K) {
  return computed(() => {
    const inj = layoutMembers;
    if (inj && key in inj && inj[key] !== undefined) {
      return unref(inj[key] as MaybeRef<AppLayoutMembersColumnProps[K]>);
    }
    return props[key];
  });
}

/** Must be a stable computed ref; calling `pick()` inside another computed creates a fresh inner ref each run and can drop reactivity to inject updates. */
const layoutInjectedIsVisible = pick('isVisible');
const isVisible = computed(() => {
  if (props.visibilityOverride != null) {
    // Compact tri-pane uses `visibilityOverride` to force-show the members surface
    // even when the desktop members column gate is false (collapsed / DM / explore).
    // If we *already* have an injected `isVisible=true`, never allow a `false`
    // override to hide the desktop members column (prevents "invisible members" bugs
    // if the prop is accidentally threaded onto a non-compact instance).
    if (props.visibilityOverride === false && layoutInjectedIsVisible.value) {
      return true;
    }
    return props.visibilityOverride;
  }
  return !!layoutInjectedIsVisible.value;
});
const effectiveActiveChannel = pick('effectiveActiveChannel');
const users = computed(() => pick('users').value ?? []);
const memberListUsers = computed(() => pick('memberListUsers').value ?? []);
const memberListShowGuests = computed(
  () => pick('memberListShowGuests').value ?? false,
);
const onUpdateMemberListShowGuests = pick('onUpdateMemberListShowGuests');

function onMemberListShowGuestsUpdate(next: boolean) {
  onUpdateMemberListShowGuests.value?.(next);
}
const memberListUsersForPanel = computed(() =>
  filterMemberListUsersForPanel(memberListUsers.value, {
    showGuests: memberListShowGuests.value,
    currentUserId: currentUserId.value,
  }),
);
const memberListGuestCount = computed(() =>
  countMemberListGuests(memberListUsers.value),
);
const selectedServerId = computed(() => pick('selectedServerId').value ?? '');
const memberPanelCollapsed = computed(() => {
  if (props.visibilityOverride != null) {
    return false;
  }
  return pick('memberPanelCollapsed').value ?? false;
});
const currentUserId = pick('currentUserId');
const serverOwnerId = pick('serverOwnerId');
const canModerateMemberUser = pick('canModerateMemberUser');
const canModerateMemberAction = pick('canModerateMemberAction');
const onModerateMemberUser = pick('onModerateMemberUser');
const canChangeMemberNickname = pick('canChangeMemberNickname');
const onChangeMemberNickname = pick('onChangeMemberNickname');
const onMessageMemberUser = pick('onMessageMemberUser');
const resolveHighestRole = pick('resolveHighestRole');
const roleManagement = pick('roleManagement');
const presenceMobileByUserId = computed(
  () => pick('presenceMobileByUserId').value,
);
const discordOnlineByUserId = computed(
  () => pick('discordOnlineByUserId').value,
);
const lastOnlineAtByUserId = computed(() => pick('lastOnlineAtByUserId').value);
const memberListLoading = pick('memberListLoading');
const echoMemberSectionOrdering = pick('echoMemberSectionOrdering');
const onUpdateMemberPanelCollapsed = pick('onUpdateMemberPanelCollapsed');
const onOpenMemberProfile = pick('onOpenMemberProfile');

watch(
  () => ({
    isVisible: isVisible.value,
    visibilityOverride:
      props.visibilityOverride === undefined ? null : props.visibilityOverride,
    memberListUsersLen: memberListUsers.value.length,
    memberListUsersForPanelLen: memberListUsersForPanel.value.length,
    memberListGuestCount: memberListGuestCount.value,
    memberListShowGuests: memberListShowGuests.value,
    usersLen: users.value.length,
    effectiveActiveChannelId: effectiveActiveChannel.value?.id ?? null,
    memberPanelCollapsed: memberPanelCollapsed.value,
    memberListLoading: memberListLoading.value,
    hasInject: !!layoutMembers,
  }),
  (v) => {
    layoutHyperLog('MembersColumn:inject', v as Record<string, unknown>);
  },
  { flush: 'post' },
);

const searchPanel = inject(APP_LAYOUT_SEARCH_PANEL_KEY, null);

function fromSearchOrLayoutOrProps<K extends keyof AppLayoutMembersColumnProps>(
  key: K,
) {
  return computed(() => {
    if (searchPanel) {
      switch (key) {
        case 'searchText':
          return searchPanel.searchText.value as AppLayoutMembersColumnProps[K];
        case 'filterChips':
          return searchPanel.filterChips
            .value as AppLayoutMembersColumnProps[K];
        case 'allChannels':
          return searchPanel.allChannels
            .value as AppLayoutMembersColumnProps[K];
        case 'paginatedSearchResults':
          return searchPanel.paginatedSearchResults
            .value as AppLayoutMembersColumnProps[K];
        case 'searchResultMessagesCount':
          return searchPanel.searchResultMessages.value
            .length as AppLayoutMembersColumnProps[K];
        case 'searchResultPage':
          return searchPanel.searchResultPage
            .value as AppLayoutMembersColumnProps[K];
        case 'totalPages':
          return searchPanel.totalPages.value as AppLayoutMembersColumnProps[K];
        case 'selectedServerName':
          return searchPanel.selectedServerName
            .value as AppLayoutMembersColumnProps[K];
        case 'searchLoading':
          return searchPanel.searchLoading
            .value as AppLayoutMembersColumnProps[K];
        case 'searchError':
          return searchPanel.searchError
            .value as AppLayoutMembersColumnProps[K];
        case 'searchScopeHint':
          return searchPanel.searchScopeHint
            .value as AppLayoutMembersColumnProps[K];
        default:
          break;
      }
    }
    const inj = layoutMembers;
    if (inj && key in inj && inj[key] !== undefined) {
      return unref(inj[key] as MaybeRef<AppLayoutMembersColumnProps[K]>);
    }
    return props[key];
  });
}

const resolvedSearchText = fromSearchOrLayoutOrProps('searchText');
const resolvedFilterChips = fromSearchOrLayoutOrProps('filterChips');
const resolvedAllChannels = fromSearchOrLayoutOrProps('allChannels');
const resolvedPaginatedSearchResults = fromSearchOrLayoutOrProps(
  'paginatedSearchResults',
);
const resolvedSearchResultMessagesCount = fromSearchOrLayoutOrProps(
  'searchResultMessagesCount',
);
const resolvedSearchResultPage = fromSearchOrLayoutOrProps('searchResultPage');
const resolvedTotalPages = fromSearchOrLayoutOrProps('totalPages');
const resolvedSelectedServerName =
  fromSearchOrLayoutOrProps('selectedServerName');

function resolvedOnSearchInput(v: string) {
  if (searchPanel) searchPanel.onSearchInput(v);
  else if (layoutMembers?.onSearchInput !== undefined) {
    unref(layoutMembers.onSearchInput)(v);
  } else props.onSearchInput?.(v);
}
function resolvedAddFilter(key: FilterKey, value: string | boolean | HasType) {
  if (searchPanel) searchPanel.addFilter(key, value);
  else if (layoutMembers?.addFilter !== undefined) {
    unref(layoutMembers.addFilter)(key, value);
  } else props.addFilter?.(key, value);
}
function resolvedRemoveFilter(key: FilterKey) {
  if (searchPanel) searchPanel.removeFilter(key);
  else if (layoutMembers?.removeFilter !== undefined) {
    unref(layoutMembers.removeFilter)(key);
  } else props.removeFilter?.(key);
}
function resolvedClearSearch() {
  if (searchPanel) searchPanel.clearSearch();
  else if (layoutMembers?.clearSearch !== undefined) {
    unref(layoutMembers.clearSearch)();
  } else props.clearSearch?.();
}
function resolvedGoToSearchPage(page: number) {
  if (searchPanel) searchPanel.goToSearchPage(page);
  else if (layoutMembers?.goToSearchPage !== undefined) {
    unref(layoutMembers.goToSearchPage)(page);
  } else props.goToSearchPage?.(page);
}
function resolvedHandleGoToMessage(channelId: string, messageId: string) {
  if (searchPanel) searchPanel.handleGoToMessage(channelId, messageId);
  else if (layoutMembers?.handleGoToMessage !== undefined) {
    unref(layoutMembers.handleGoToMessage)(channelId, messageId);
  } else props.handleGoToMessage?.(channelId, messageId);
}

const resolvedSearchLoading = computed(() => {
  if (searchPanel) return searchPanel.searchLoading.value;
  if (layoutMembers && layoutMembers.searchLoading !== undefined) {
    return unref(layoutMembers.searchLoading);
  }
  return props.searchLoading ?? false;
});
const resolvedSearchError = computed(() => {
  if (searchPanel) return searchPanel.searchError.value;
  if (layoutMembers && layoutMembers.searchError !== undefined) {
    return unref(layoutMembers.searchError);
  }
  return props.searchError ?? null;
});
const resolvedSearchScopeHint = computed(() => {
  if (searchPanel) return searchPanel.searchScopeHint.value;
  if (layoutMembers && layoutMembers.searchScopeHint !== undefined) {
    return unref(layoutMembers.searchScopeHint);
  }
  return props.searchScopeHint ?? '';
});
</script>

<template>
  <div
    v-if="isVisible"
    class="members-column relative flex min-w-0 flex-col overflow-hidden"
  >
    <div
      class="chat-header-glass pointer-events-auto absolute top-0 left-0 right-0 z-20 flex h-12 min-w-0 flex-shrink-0 items-center gap-2 px-4"
    >
      <div
        v-if="effectiveActiveChannel"
        class="search-input-wrapper relative flex h-full min-w-0 flex-1 items-end"
      >
        <SearchBar
          :model-value="resolvedSearchText ?? ''"
          :filter-chips="resolvedFilterChips ?? []"
          :channels="resolvedAllChannels ?? []"
          :users="users"
          :search-results="resolvedPaginatedSearchResults"
          :total-results="resolvedSearchResultMessagesCount"
          :current-page="resolvedSearchResultPage"
          :total-pages="resolvedTotalPages"
          :placeholder="
            `Search ${resolvedSelectedServerName}`.trim() || 'Search'
          "
          :dropdown-gap-px="0"
          :dropdown-horizontal-pad-px="0"
          @update:model-value="resolvedOnSearchInput"
          @add-filter="resolvedAddFilter"
          @remove-filter="resolvedRemoveFilter"
          @clear-search="resolvedClearSearch"
          @go-to-page="resolvedGoToSearchPage"
          @go-to-message="resolvedHandleGoToMessage"
          :search-loading="resolvedSearchLoading"
          :search-error="resolvedSearchError"
          :search-scope-hint="resolvedSearchScopeHint"
        />
      </div>
    </div>
    <MemberList
      class="min-w-0 flex-1"
      :users="memberListUsersForPanel"
      :show-guests="memberListShowGuests"
      :guest-count="memberListGuestCount"
      @update:show-guests="onMemberListShowGuestsUpdate"
      :server-owner-id="serverOwnerId"
      :presence-mobile-by-user-id="presenceMobileByUserId"
      :discord-online-by-user-id="discordOnlineByUserId"
      :last-online-at-by-user-id="lastOnlineAtByUserId"
      :server-id="selectedServerId"
      :collapsed="memberPanelCollapsed"
      :visible="true"
      :current-user-id="currentUserId"
      :can-moderate-user="canModerateMemberUser"
      :can-moderate-member-action="canModerateMemberAction"
      :on-moderate-user="onModerateMemberUser"
      :can-change-member-nickname="canChangeMemberNickname"
      :on-change-member-nickname="onChangeMemberNickname"
      :on-message-user="onMessageMemberUser"
      :resolve-highest-role="resolveHighestRole"
      :role-management="roleManagement"
      :loading-role-hierarchy="memberListLoading"
      :echo-member-section-ordering="echoMemberSectionOrdering"
      @update:collapsed="onUpdateMemberPanelCollapsed"
      @open-profile="onOpenMemberProfile"
    />
  </div>
</template>
