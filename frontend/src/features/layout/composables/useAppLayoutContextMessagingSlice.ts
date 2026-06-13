import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

type MessagingSliceKeys =
  | 'handleGoToChannel'
  | 'handleGoToMessage'
  | 'handlePollVote'
  | 'handleReact'
  | 'pinMessage'
  | 'toggleReaction'
  | 'votePoll'
  | 'recordReaction'
  | 'removeReactionFavorite'
  | 'topReactions'
  | 'goToPinnedMessage'
  | 'goToSearchPage'
  | 'searchError'
  | 'searchLoading'
  | 'searchResultMessages'
  | 'searchResultPage'
  | 'searchScopeHint'
  | 'searchText'
  | 'paginatedSearchResults'
  | 'totalPages'
  | 'onSearchInput'
  | 'clearSearch'
  | 'forwardModalOpen'
  | 'forwardPickerDestinations'
  | 'forwardModalSourceSummary'
  | 'openForwardMessagePicker'
  | 'closeForwardMessagePicker'
  | 'submitForwardedMessage'
  | 'socketSendMessage'
  | 'sendMessage'
  | 'searchActiveTab'
  | 'searchFilter'
  | 'searchIsLoading'
  | 'searchResults'
  | 'searchStatus';

export function useAppLayoutContextMessagingSlice(
  deps: Pick<AppLayoutControllerContext, MessagingSliceKeys>,
) {
  const slice: Pick<AppLayoutControllerContext, MessagingSliceKeys> = {
    ...deps,
  };
  return slice;
}

export type BuildAppLayoutMessagingSliceDeps = Parameters<
  typeof useAppLayoutContextMessagingSlice
>[0];

export function buildAppLayoutMessagingSliceDeps(
  deps: BuildAppLayoutMessagingSliceDeps,
): BuildAppLayoutMessagingSliceDeps {
  return deps;
}
