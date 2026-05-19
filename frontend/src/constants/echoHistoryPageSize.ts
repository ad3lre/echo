/**
 * Channel history page size (initial + prepend). Server clamps to 100 — use the max so
 * we refetch less often (memory/network trade: larger payloads, fewer round trips).
 */
export const ECHO_CHANNEL_MESSAGE_PAGE_SIZE = 100;
