/**
 * Message list — **row presentation rebuild authority**.
 * Incremental vs full rebuild, fingerprint skip, deferred patch-while-scrolling.
 */

import { ref, watch, type ComputedRef, type Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  collectMessageListRowFactsPatchIndices,
  describeOrderedIdsStructuralChange,
  fingerprintMessageListRowFactsInputs,
  type MessageWithAuthorRow,
  type OrderedIdsStructuralChange,
} from '@/features/chat/domain/messageListRowFacts';
import {
  buildMessageListRowPresentationAtIndex,
  buildMessageListRowPresentations,
  type MessageListRowPresentation,
} from '@/features/chat/domain/messageListRowPresentation';
import { createMessageListRowInvalidationController } from '@/features/chat/domain/messageListRowInvalidation';
import { messageListScrollMetricsApi } from '@/features/chat/composables/messageListScrollMetrics';
import {
  logMessageList,
  messageListDebugEnabled,
} from '@/features/chat/composables/messageListDebugLog';

export type MessageListRowPresentationInputs = {
  ids: readonly string[];
  entities: ReadonlyMap<string, RawMessage>;
  messages: Map<string, MessageWithAuthorRow>;
  compactTop: boolean;
  firstUnreadMessageId: string | null;
  lastReadMessageId: string | null;
  showUnreadSeparator: boolean;
};

export type UseMessageListRowPresentationsOptions = {
  displayOrderedIds: Ref<readonly string[]> | ComputedRef<readonly string[]>;
  mergedEntitiesForList:
    | Ref<ReadonlyMap<string, RawMessage>>
    | ComputedRef<ReadonlyMap<string, RawMessage>>;
  mergedMessagesForList:
    | Ref<Map<string, MessageWithAuthorRow>>
    | ComputedRef<Map<string, MessageWithAuthorRow>>;
  compactTop: () => boolean;
  firstUnreadMessageId: () => string | null;
  lastReadMessageId: () => string | null;
  showUnreadSeparator: () => boolean;
  isUserScrollActive: () => boolean;
  onPatchedRows: (messageIds: readonly string[]) => void;
};

type RebuildKind = 'chrome' | 'full_struct';

type PresentationState = {
  rows: Ref<MessageListRowPresentation[]>;
  fingerprints: Map<string, string>;
  invalidation: ReturnType<typeof createMessageListRowInvalidationController>;
  pendingRefreshAfterScroll: boolean;
  prevOrderedIds: string[] | null;
  prevCompactTop: boolean | undefined;
  prevFirstUnreadMessageId: string | null | undefined;
  prevLastReadMessageId: string | null | undefined;
  prevShowUnreadSeparator: boolean | undefined;
  options: UseMessageListRowPresentationsOptions;
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

function resetFingerprints(
  state: PresentationState,
  ids: readonly string[],
  messages: Map<string, MessageWithAuthorRow>,
  entities: ReadonlyMap<string, RawMessage>,
): void {
  state.fingerprints.clear();
  for (const id of ids) {
    state.fingerprints.set(
      id,
      fingerprintMessageListRowFactsInputs(id, messages, entities),
    );
  }
}

function rememberPrev(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
): void {
  state.prevOrderedIds = curr.ids.slice();
  state.prevCompactTop = curr.compactTop;
  state.prevFirstUnreadMessageId = curr.firstUnreadMessageId;
  state.prevLastReadMessageId = curr.lastReadMessageId;
  state.prevShowUnreadSeparator = curr.showUnreadSeparator;
}

function applyFullRebuild(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
): void {
  state.rows.value = buildMessageListRowPresentations(
    curr.ids,
    curr.messages,
    curr.entities,
    curr.compactTop,
    curr.firstUnreadMessageId,
    curr.lastReadMessageId,
    curr.showUnreadSeparator,
  );
  resetFingerprints(state, curr.ids, curr.messages, curr.entities);
  rememberPrev(state, curr);
}

function logRebuild(
  kind: RebuildKind,
  startedAtMs: number,
  rowCount: number,
): void {
  const dur = nowMs() - startedAtMs;
  if (kind === 'full_struct' && performance.mark && performance.measure) {
    performance.mark('messagelist-rebuild-end');
    performance.measure(
      'MessageListRebuildRows',
      'messagelist-rebuild-start',
      'messagelist-rebuild-end',
    );
  }
  if (!messageListDebugEnabled()) return;
  logMessageList('row_presentation', 'row_presentations_rebuilt', {
    kind,
    durationMs: dur,
    rowCount,
  });
}

function shouldRebuildForChrome(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
): boolean {
  return (
    (state.prevCompactTop !== undefined &&
      curr.compactTop !== state.prevCompactTop) ||
    (state.prevShowUnreadSeparator !== undefined &&
      curr.showUnreadSeparator !== state.prevShowUnreadSeparator)
  );
}

function shouldRebuildForUnread(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
): boolean {
  return (
    (state.prevFirstUnreadMessageId !== undefined &&
      curr.firstUnreadMessageId !== state.prevFirstUnreadMessageId) ||
    (state.prevLastReadMessageId !== undefined &&
      curr.lastReadMessageId !== state.prevLastReadMessageId)
  );
}

function shouldDeferDuringUserScroll(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
  struct: OrderedIdsStructuralChange,
): boolean {
  return (
    state.options.isUserScrollActive() &&
    struct.kind === 'same' &&
    state.prevCompactTop === curr.compactTop &&
    state.prevFirstUnreadMessageId === curr.firstUnreadMessageId &&
    state.prevLastReadMessageId === curr.lastReadMessageId &&
    state.prevShowUnreadSeparator === curr.showUnreadSeparator
  );
}

function collectChangedIds(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
): Set<string> {
  const changed = new Set<string>();
  for (const id of curr.ids) {
    const fp = fingerprintMessageListRowFactsInputs(
      id,
      curr.messages,
      curr.entities,
    );
    if (fp !== state.fingerprints.get(id)) {
      changed.add(id);
      state.fingerprints.set(id, fp);
    }
  }
  const idSet = new Set(curr.ids);
  for (const k of state.fingerprints.keys()) {
    if (!idSet.has(k)) state.fingerprints.delete(k);
  }
  return changed;
}

function collectPatchIndices(
  curr: MessageListRowPresentationInputs,
  struct: OrderedIdsStructuralChange,
  changed: Set<string>,
): Set<number> {
  const patchIndices = new Set<number>();
  if (struct.kind === 'append_one' || struct.kind === 'prepend_one') {
    for (const i of struct.patchIndices) patchIndices.add(i);
  }
  for (const i of collectMessageListRowFactsPatchIndices(
    curr.ids,
    curr.messages,
    curr.entities,
    changed,
  )) {
    patchIndices.add(i);
  }
  return patchIndices;
}

function applyInPlacePatches(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
  patchIndices: Set<number>,
): void {
  const arr = state.rows.value;
  const n = curr.ids.length;
  for (const i of patchIndices) {
    if (i < 0 || i >= n) continue;
    arr[i] = buildMessageListRowPresentationAtIndex(
      curr.ids,
      curr.messages,
      curr.entities,
      curr.compactTop,
      curr.firstUnreadMessageId,
      curr.lastReadMessageId,
      i,
      curr.showUnreadSeparator,
    );
  }
}

function applyIncrementalChange(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
  struct: OrderedIdsStructuralChange,
  startedAtMs: number,
): void {
  const changed = collectChangedIds(state, curr);
  if (struct.kind === 'same' && changed.size === 0) {
    rememberPrev(state, curr);
    return;
  }
  const patchIndices = collectPatchIndices(curr, struct, changed);
  if (state.rows.value.length !== curr.ids.length) {
    applyFullRebuild(state, curr);
    return;
  }
  applyInPlacePatches(state, curr, patchIndices);
  rememberPrev(state, curr);
  const dur = nowMs() - startedAtMs;
  messageListScrollMetricsApi()?.noteRowPresentationRebuild(dur);
  if (messageListDebugEnabled() && dur > 5) {
    logMessageList('row_presentation', 'row_presentations_patched', {
      durationMs: dur,
      rowCount: curr.ids.length,
    });
  }
}

function onInputsChanged(
  state: PresentationState,
  curr: MessageListRowPresentationInputs,
): void {
  const t0 = nowMs();
  const n = curr.ids.length;
  if (shouldRebuildForChrome(state, curr)) {
    applyFullRebuild(state, curr);
    logRebuild('chrome', t0, n);
    return;
  }
  if (shouldRebuildForUnread(state, curr)) {
    applyFullRebuild(state, curr);
    return;
  }
  const struct = describeOrderedIdsStructuralChange(
    state.prevOrderedIds,
    curr.ids,
  );
  if (shouldDeferDuringUserScroll(state, curr, struct)) {
    state.pendingRefreshAfterScroll = true;
    state.invalidation.invalidate('message_entity', curr.ids, curr.ids, true);
    return;
  }
  if (struct.kind === 'full') {
    if (performance.mark) performance.mark('messagelist-rebuild-start');
    applyFullRebuild(state, curr);
    logRebuild('full_struct', t0, n);
    return;
  }
  applyIncrementalChange(state, curr, struct, t0);
}

function patchDirtyIdsAfterScroll(state: PresentationState): void {
  const dirtyIds = state.invalidation.drain(false);
  if (dirtyIds.length === 0) return;
  const curr = readInputs(state.options);
  const arr = state.rows.value;
  if (arr.length !== curr.ids.length) return;
  const idToIndex = new Map(curr.ids.map((id, i) => [id, i]));
  const patchIndices = new Set<number>();
  for (const id of dirtyIds) {
    const i = idToIndex.get(id);
    if (i != null) patchIndices.add(i);
  }
  for (const i of collectMessageListRowFactsPatchIndices(
    curr.ids,
    curr.messages,
    curr.entities,
    new Set(dirtyIds),
  )) {
    patchIndices.add(i);
  }
  applyInPlacePatches(state, curr, patchIndices);
  for (const i of patchIndices) {
    const id = curr.ids[i];
    if (!id) continue;
    state.fingerprints.set(
      id,
      fingerprintMessageListRowFactsInputs(id, curr.messages, curr.entities),
    );
  }
  state.options.onPatchedRows(
    [...patchIndices].map((i) => curr.ids[i]!).filter(Boolean),
  );
}

function flushPendingAfterScrollSettle(state: PresentationState): void {
  if (!state.pendingRefreshAfterScroll) return;
  state.pendingRefreshAfterScroll = false;
  state.invalidation.flushDeferredToImmediate();
  patchDirtyIdsAfterScroll(state);
}

function readInputs(
  options: UseMessageListRowPresentationsOptions,
): MessageListRowPresentationInputs {
  return {
    ids: options.displayOrderedIds.value,
    entities: options.mergedEntitiesForList.value,
    messages: options.mergedMessagesForList.value,
    compactTop: options.compactTop(),
    firstUnreadMessageId: options.firstUnreadMessageId(),
    lastReadMessageId: options.lastReadMessageId(),
    showUnreadSeparator: options.showUnreadSeparator(),
  };
}

function installPresentationWatch(state: PresentationState): void {
  watch(
    () => readInputs(state.options),
    (curr) => onInputsChanged(state, curr),
    { immediate: true },
  );
}

export function useMessageListRowPresentations(
  options: UseMessageListRowPresentationsOptions,
) {
  const state: PresentationState = {
    rows: ref([]),
    fingerprints: new Map(),
    invalidation: createMessageListRowInvalidationController(),
    pendingRefreshAfterScroll: false,
    prevOrderedIds: null,
    prevCompactTop: undefined,
    prevFirstUnreadMessageId: undefined,
    prevLastReadMessageId: undefined,
    prevShowUnreadSeparator: undefined,
    options,
  };
  installPresentationWatch(state);
  return {
    messageListRowPresentations: state.rows,
    flushPendingRowFactsAfterScrollSettle: () =>
      flushPendingAfterScrollSettle(state),
    clearUnreadBoundaryMemory: () => {
      state.prevFirstUnreadMessageId = undefined;
      state.prevLastReadMessageId = undefined;
    },
  };
}
