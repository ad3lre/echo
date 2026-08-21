/** Maximum text-channel heads retained for the selected server. */
export const WARM_CHANNEL_CACHE_MAX_CHANNELS = 30;
/** Newest messages retained/fetched for each background channel. */
export const WARM_CHANNEL_CACHE_MESSAGES_PER_CHANNEL = 30;
/** Maximum simultaneous background history requests. */
export const WARM_CHANNEL_CACHE_FETCH_CONCURRENCY = 3;
/** Durable channel heads older than this are discarded. */
export const WARM_CHANNEL_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
