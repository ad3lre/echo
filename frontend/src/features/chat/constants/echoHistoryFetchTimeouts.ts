/** Bounded wait for first-page history (`loadHistory` / cold channel). */
export const ECHO_HISTORY_INITIAL_FETCH_TIMEOUT_MS = 45_000;

/** Bounded wait for paginated older history (`loadOlder`). */
export const ECHO_HISTORY_LOAD_OLDER_TIMEOUT_MS = 35_000;

/** Per-request cap while prefetching pages for jump-to-message (loop also caps page count). */
export const ECHO_HISTORY_PREFETCH_FETCH_TIMEOUT_MS = 28_000;
