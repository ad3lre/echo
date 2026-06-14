/**
 * Channel history page size for scroll-up pagination (prepend). Server clamps to 100.
 * 80 balances payload size against round-trip count.
 */
export const ECHO_CHANNEL_MESSAGE_PAGE_SIZE = 80;

/**
 * Smaller FIRST page for a cold channel open. The skeleton stays up until this
 * page is fetched + applied + anchored, so a 720p viewport (~15-20 rows) is served
 * sooner; scroll-up then pages the rest at {@link ECHO_CHANNEL_MESSAGE_PAGE_SIZE}.
 * Whoever applies this page must pass it as the `pageLimit` to
 * `applyEchoHistoryInitialPageFromApi` so `hasMoreOlder` compares against the size
 * actually requested (otherwise scroll-up history would be wrongly disabled).
 */
export const ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE = 40;
