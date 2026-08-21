/**
 * Opt-in console traces for message list scroll, prepend transactions, and load-older.
 *
 * **Enable:** `localStorage.setItem('echo_message_list_debug', '1')` then reload.
 *
 * **Reading logs**
 * - `outcomeOk` / `expectation` — when present, compare to `anchorDriftPx`, `distFromBottomPx`,
 *   etc. to see if behavior matched intent.
 * - `source` + `message` — stable event id (grep-friendly).
 * - Correlation: `txId` (prepend), `scheduleId` (initial anchor), `channelId` where applicable.
 *
 * **Sources (non-exhaustive)**
 * - `window` — `active_window_updated` (ordered list from authority)
 * - `lifecycle` — channel switch, handler caches cleared
 * - `initial_anchor` — first scroll after history (`initial_anchor_commit`)
 * - `prepend` — snapshot, transaction, restore, drift vs threshold
 * - `scroll` — idle flush, load-older gate, trigger
 * - `jump_ui` — FAB / pending-new state from scroll
 * - `history` — API layer (`echoHistoryOrchestration`)
 * - `measure` — virtual row measure defer cap
 */
const LS_KEY = 'echo_message_list_debug';

let traceSeq = 0;

export function messageListDebugEnabled(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(LS_KEY) === '1'
    );
  } catch {
    return false;
  }
}

/** Monotonic sequence for ordering log lines in one session. */
export function nextMessageListTraceSeq(): number {
  traceSeq += 1;
  return traceSeq;
}

export type MessageListOutcomeFields = {
  /** Whether the step achieved its intended effect (see `expectation`). */
  outcomeOk?: boolean;
  /** One-line description of what “good” means for this step. */
  expectation?: string;
};

export function logMessageList(
  source: string,
  message: string,
  data?: Record<string, unknown> & MessageListOutcomeFields,
): void {
  if (!messageListDebugEnabled()) return;
  try {
    const seq = nextMessageListTraceSeq();
    const t =
      typeof performance !== 'undefined'
        ? Math.round(performance.now())
        : undefined;
    // eslint-disable-next-line no-console
    console.log('[echo][message-list]', { seq, t, source, message, data });
  } catch {
    // ignore
  }
}

/** Throttle noisy scroll-adjacent logs (ms). */
export function logMessageListThrottled(
  key: string,
  minIntervalMs: number,
  source: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!messageListDebugEnabled()) return;
  const g = logMessageListThrottled as unknown as {
    _last?: Map<string, number>;
  };
  if (!g._last) g._last = new Map();
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = g._last.get(key) ?? 0;
  if (now - last < minIntervalMs) return;
  g._last.set(key, now);
  logMessageList(source, message, data);
}
