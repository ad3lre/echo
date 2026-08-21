/**
 * DEV-only counters for the chat layout subtraction project.
 *
 * **Permanent diagnostics** (Commit H): keep these for ongoing removal-metric
 * comparisons; do not strip after the subtraction phases land.
 *
 * Invariants (assert / log before simplifying measurement):
 * 1. One rendered row → one current revision.
 * 2. One revision → one accepted measured height.
 * 3. A resize schedules at most one pending measurement.
 * 4. Only above-viewport growth may compensate while browsing history.
 * 5. Only pinned + inactive users may receive follow-tail compensation.
 * 6. Every programmatic scroll has an ownership intent.
 * 7. Each height delta has exactly one owner (prepend TX XOR generic compensation).
 *
 * Removal metrics: compare snapshots across phases; counts must go down.
 */

export type MessageListSubtractionSnapshot = {
  rowMounts: number;
  rowUnmounts: number;
  measureElementCalls: number;
  duplicateMeasuresSameRevision: number;
  channelSwitchVisibleRemounts: number;
  resizeScheduleCalls: number;
  resizeFlushCalls: number;
  /** Times we deferred a resize while content already taller than the slot (should stay ~0). */
  deferredWithOverflowCount: number;
  scrollWritesByIntent: Record<string, number>;
  hydrationEpochBumps: number;
  hydrationForceHydrates: number;
};

const emptySnapshot = (): MessageListSubtractionSnapshot => ({
  rowMounts: 0,
  rowUnmounts: 0,
  measureElementCalls: 0,
  duplicateMeasuresSameRevision: 0,
  channelSwitchVisibleRemounts: 0,
  resizeScheduleCalls: 0,
  resizeFlushCalls: 0,
  deferredWithOverflowCount: 0,
  scrollWritesByIntent: {},
  hydrationEpochBumps: 0,
  hydrationForceHydrates: 0,
});

let snapshot = emptySnapshot();
const lastMeasureByRevision = new Map<string, number>();
let currentVisibleIds: string[] = [];
let pendingChannelSwitch = false;
let preSwitchVisibleIds = new Set<string>();

export function resetMessageListSubtractionDiagnosticsForTests(): void {
  snapshot = emptySnapshot();
  lastMeasureByRevision.clear();
  currentVisibleIds = [];
  pendingChannelSwitch = false;
  preSwitchVisibleIds = new Set();
}

export function getMessageListSubtractionSnapshot(): MessageListSubtractionSnapshot {
  return {
    ...snapshot,
    scrollWritesByIntent: { ...snapshot.scrollWritesByIntent },
  };
}

function enabled(): boolean {
  return import.meta.env.DEV === true;
}

export function noteSubtractionRowMount(messageId: string | null): void {
  if (!enabled() || !messageId) return;
  snapshot.rowMounts += 1;
}

export function noteSubtractionRowUnmount(messageId: string | null): void {
  if (!enabled() || !messageId) return;
  snapshot.rowUnmounts += 1;
}

export function noteSubtractionMeasureElement(
  rowKey: string,
  revisionKey: string | null,
): void {
  if (!enabled()) return;
  snapshot.measureElementCalls += 1;
  if (!revisionKey) return;
  const key = `${rowKey}|${revisionKey}`;
  const prior = lastMeasureByRevision.get(key) ?? 0;
  if (prior > 0) snapshot.duplicateMeasuresSameRevision += 1;
  lastMeasureByRevision.set(key, prior + 1);
}

/** Keep latest visible ids for channel-switch capture (no remount counting). */
export function noteSubtractionChannelVisibleIds(
  messageIds: readonly string[],
): void {
  if (!enabled()) return;
  currentVisibleIds = messageIds.filter(Boolean);
  if (!pendingChannelSwitch || currentVisibleIds.length === 0) return;
  let remounts = 0;
  for (const id of currentVisibleIds) {
    if (preSwitchVisibleIds.has(id)) remounts += 1;
  }
  snapshot.channelSwitchVisibleRemounts += remounts;
  pendingChannelSwitch = false;
  preSwitchVisibleIds = new Set();
}

/** Call at channel-change start before clearing list state. */
export function noteSubtractionBeginChannelSwitch(): void {
  if (!enabled()) return;
  preSwitchVisibleIds = new Set(currentVisibleIds);
  pendingChannelSwitch = true;
}

export function noteSubtractionResizeSchedule(): void {
  if (!enabled()) return;
  snapshot.resizeScheduleCalls += 1;
}

export function noteSubtractionResizeFlush(): void {
  if (!enabled()) return;
  snapshot.resizeFlushCalls += 1;
}

/** DEV: deferred while contentHeight > slot — overflow during an invariant breach. */
export function noteSubtractionDeferredWithOverflow(overflowPx: number): void {
  if (!enabled()) return;
  if (!(overflowPx > 0)) return;
  snapshot.deferredWithOverflowCount += 1;
}

export function noteSubtractionScrollWrite(intent: string): void {
  if (!enabled()) return;
  snapshot.scrollWritesByIntent[intent] =
    (snapshot.scrollWritesByIntent[intent] ?? 0) + 1;
}

export function noteSubtractionHydrationEpochBump(): void {
  if (!enabled()) return;
  snapshot.hydrationEpochBumps += 1;
}

export function noteSubtractionHydrationForceHydrate(): void {
  if (!enabled()) return;
  snapshot.hydrationForceHydrates += 1;
}

export function logMessageListSubtractionSnapshot(label: string): void {
  if (!enabled()) return;
  void label;
  // Snapshot is readable via getMessageListSubtractionSnapshot(); avoid console
  // in runtime modules (charter C12). Callers may log in DEV test harnesses.
}
