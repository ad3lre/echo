/**
 * Channel history page size (initial + prepend). Server clamps to 100.
 * 80 balances payload size against round-trip count.
 */
export const ECHO_CHANNEL_MESSAGE_PAGE_SIZE = 80;
