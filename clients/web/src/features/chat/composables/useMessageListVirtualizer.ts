/**
 * Message list — **virtualizer options + instance authority**.
 *
 * Owns row-size estimates, overscan, the measurements cache, and the TanStack
 * virtualizer instance. Does not own prepend TX, initial-anchor commits, or
 * programmatic scroll writes.
 */

import {
  computed,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import type { VirtualItem } from '@tanstack/virtual-core';
import type { MessageWithAuthor } from '@shared/types';
import { shouldShowDaySeparatorBefore } from '@/features/chat/domain/messageListRowFacts';
import type { MessageListRowPresentation } from '@/features/chat/domain/messageListRowPresentation';
import {
  MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX,
  estimateMessageListRowSizePx,
} from '@/features/chat/domain/messageListRowEstimate';
import { buildMessageRowRevisionKey } from '@/features/chat/domain/messageRowRevisionKey';
import {
  buildInitialMeasurementsCacheForChannel,
  getCachedMessageRowHeightPx,
} from '@/features/chat/domain/messageRowHeightStore';
import { resolveMessageListInitialOffsetPx } from '@/features/chat/domain/messageListInitialOffset';
import { readMessageListViewport } from '@/features/chat/composables/messageListViewportStorage';
import {
  MESSAGE_LIST_COMPENSATION_ANCHOR_RECONCILE,
  MESSAGE_LIST_STABLE_OVERSCAN,
} from '@/features/chat/domain/messageListScrollPolicy';
import {
  resolveShouldAdjustScrollPosition,
  type ScrollCompensationController,
} from '@/features/chat/domain/messageListScrollCompensation';
import type { createMessageListScrollOwnership } from '@/features/chat/domain/messageListScrollOwnership';

const MESSAGE_LIST_OVERSCAN_IDLE = 24;
const MESSAGE_LIST_OVERSCAN_IDLE_COARSE = 24;

export type MessageListOverscanInput = {
  olderFetchSkeletonActive: boolean;
  coarsePointer: boolean;
  safariLikeBrowser: boolean;
};

export function resolveMessageListOverscanPx(
  input: MessageListOverscanInput,
): number {
  const stable = MESSAGE_LIST_STABLE_OVERSCAN;
  if (input.olderFetchSkeletonActive) return stable * 2;
  const idleOverscan = input.coarsePointer
    ? MESSAGE_LIST_OVERSCAN_IDLE_COARSE
    : MESSAGE_LIST_OVERSCAN_IDLE;
  return input.safariLikeBrowser ? Math.max(stable, idleOverscan) : stable;
}

export type UseMessageListVirtualizerOptions = {
  getContainer: () => HTMLElement | null;
  getChannelId: () => string | undefined;
  displayOrderedIds: Ref<readonly string[]> | ComputedRef<readonly string[]>;
  virtualizerOrderedIds:
    | Ref<readonly string[]>
    | ComputedRef<readonly string[]>;
  messageListRowPresentations:
    | Ref<readonly MessageListRowPresentation[]>
    | ComputedRef<readonly MessageListRowPresentation[]>;
  mergedMessagesForList:
    | Ref<Map<string, MessageWithAuthor>>
    | ComputedRef<Map<string, MessageWithAuthor>>;
  scrollContainerPaddingTopPx: Ref<number> | ComputedRef<number>;
  isPrependSkeletonVirtualIndex: (virtualIndex: number) => boolean;
  virtualIndexToMessageIndex: (virtualIndex: number) => number;
  estimatePrependSkeletonRowSizePx: (
    virtualIndex: number,
    fallback: number,
  ) => number;
  olderFetchSkeletonActive: Ref<boolean> | ComputedRef<boolean>;
  coarsePointer: Ref<boolean> | ComputedRef<boolean>;
  safariLikeBrowser: boolean;
  prependTransactionActive: Ref<boolean> | ComputedRef<boolean>;
  followNewMessagesToBottom: Ref<boolean> | ComputedRef<boolean>;
  scrollObservation: { direction: 'up' | 'down' | 'still' };
  scrollCompensation: ScrollCompensationController;
  scrollOwnership: ReturnType<typeof createMessageListScrollOwnership>;
  captureScrollCompensationAnchor: () => void;
};

type EstimateState = Pick<
  UseMessageListVirtualizerOptions,
  | 'displayOrderedIds'
  | 'messageListRowPresentations'
  | 'mergedMessagesForList'
  | 'getChannelId'
  | 'isPrependSkeletonVirtualIndex'
  | 'virtualIndexToMessageIndex'
  | 'estimatePrependSkeletonRowSizePx'
>;

function revisionKeyForMessageIndex(
  state: EstimateState,
  messageIndex: number,
): string | null {
  const msgId = state.displayOrderedIds.value[messageIndex];
  const message = msgId
    ? state.mergedMessagesForList.value.get(msgId)
    : undefined;
  const rowVm = state.messageListRowPresentations.value[messageIndex];
  if (!message || !rowVm) return null;
  return buildMessageRowRevisionKey(rowVm, message);
}

function estimateMessageRowSizeForMessage(
  state: EstimateState,
  messageIndex: number,
): number {
  const msgId = state.displayOrderedIds.value[messageIndex];
  const message = msgId
    ? state.mergedMessagesForList.value.get(msgId)
    : undefined;
  if (!message) return MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX;
  const rowVm = state.messageListRowPresentations.value[messageIndex];
  const groupedWithPrevious = rowVm?.layout.groupedWithPrevious ?? false;
  const showDaySeparatorBefore =
    rowVm?.showDaySeparatorBefore ??
    shouldShowDaySeparatorBefore(
      state.displayOrderedIds.value,
      state.mergedMessagesForList.value,
      messageIndex,
    );
  const estimate = estimateMessageListRowSizePx({
    groupedWithPrevious,
    showDaySeparatorBefore,
    showUnreadSeparatorBefore: rowVm?.showUnreadSeparatorBefore ?? false,
    message,
  });
  if (!msgId || !rowVm) return estimate;
  const revisionKey = buildMessageRowRevisionKey(rowVm, message);
  return (
    getCachedMessageRowHeightPx(state.getChannelId(), msgId, revisionKey) ??
    estimate
  );
}

function estimateMessageRowSize(
  state: EstimateState,
  virtualIndex: number,
): number {
  if (state.isPrependSkeletonVirtualIndex(virtualIndex)) {
    return state.estimatePrependSkeletonRowSizePx(
      virtualIndex,
      MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX,
    );
  }
  return estimateMessageRowSizeForMessage(
    state,
    state.virtualIndexToMessageIndex(virtualIndex),
  );
}

function estimateVirtualListTotalSizePx(
  state: EstimateState,
  virtualizerOrderedIds: readonly string[],
  paddingStart: number,
): number {
  let sum = paddingStart + 16;
  for (let i = 0; i < virtualizerOrderedIds.length; i++) {
    sum += estimateMessageRowSize(state, i);
  }
  return sum;
}

function estimateInitialOffsetAtBottomPx(
  state: EstimateState,
  options: UseMessageListVirtualizerOptions,
): number {
  if (state.displayOrderedIds.value.length === 0) return 0;
  const estimated = estimateVirtualListTotalSizePx(
    state,
    options.virtualizerOrderedIds.value,
    options.scrollContainerPaddingTopPx.value,
  );
  const el = options.getContainer();
  const viewport = el?.clientHeight ?? 0;
  if (viewport <= 0) {
    const h =
      typeof window !== 'undefined'
        ? Math.max(200, Math.floor(window.innerHeight * 0.45))
        : 400;
    return Math.max(0, estimated - h);
  }
  return Math.max(0, estimated - viewport);
}

function resolveCompensationOnItemSizeChange(
  options: UseMessageListVirtualizerOptions,
  item: { start: number },
  delta: number,
  instance: { scrollOffset: number | null; scrollDirection?: string | null },
): boolean {
  options.scrollCompensation.noteWheelDirection(
    options.scrollObservation.direction,
  );
  return resolveShouldAdjustScrollPosition(
    {
      delta,
      itemStart: item.start,
      scrollOffset: instance.scrollOffset ?? null,
      scrollDirection: instance.scrollDirection,
      lastObservedScrollDirection: options.scrollObservation.direction,
      isUserActive: options.scrollOwnership.isUserActive(),
      prependTransactionActive: options.prependTransactionActive.value,
      followNewMessagesToBottom: options.followNewMessagesToBottom.value,
      experimentEnabled: MESSAGE_LIST_COMPENSATION_ANCHOR_RECONCILE,
    },
    options.scrollCompensation,
    options.captureScrollCompensationAnchor,
  );
}

function hasCachedRowMeasurement(
  options: UseMessageListVirtualizerOptions,
  estimateState: EstimateState,
  index: number,
): boolean {
  const messageIndex = options.virtualIndexToMessageIndex(index);
  const messageId = options.displayOrderedIds.value[messageIndex]?.trim();
  const revisionKey = revisionKeyForMessageIndex(estimateState, messageIndex);
  if (!messageId || !revisionKey) return false;
  return (
    getCachedMessageRowHeightPx(
      options.getChannelId(),
      messageId,
      revisionKey,
    ) != null
  );
}

function rebuildMeasurementsCache(
  options: UseMessageListVirtualizerOptions,
  estimateState: EstimateState,
) {
  return buildInitialMeasurementsCacheForChannel(
    options.getChannelId(),
    options.virtualizerOrderedIds.value,
    (index) => estimateMessageRowSize(estimateState, index),
    (index) => hasCachedRowMeasurement(options, estimateState, index),
  );
}

function watchMeasurementsCache(
  options: UseMessageListVirtualizerOptions,
  estimateState: EstimateState,
  cache: ShallowRef<VirtualItem[]>,
) {
  watch(
    () =>
      [
        options.getChannelId(),
        options.virtualizerOrderedIds.value.length,
        options.displayOrderedIds.value.join('\u001e'),
      ] as const,
    () => {
      cache.value = rebuildMeasurementsCache(options, estimateState);
    },
    { immediate: true },
  );
}

function estimateOffsetToAnchorPx(
  estimateState: EstimateState,
  anchorIndex: number,
  anchorTop: number,
): number {
  let offset = 0;
  for (let i = 0; i < anchorIndex; i++) {
    offset += estimateMessageRowSizeForMessage(estimateState, i);
  }
  return offset - anchorTop;
}

function resolveVirtualizerInitialOffset(
  options: UseMessageListVirtualizerOptions,
  estimateState: EstimateState,
): number {
  const cid = options.getChannelId()?.trim();
  const saved = cid ? readMessageListViewport(cid) : null;
  return resolveMessageListInitialOffsetPx({
    saved,
    orderedIds: options.displayOrderedIds.value,
    estimateOffsetToAnchor: (anchorIndex, anchorTop) =>
      estimateOffsetToAnchorPx(estimateState, anchorIndex, anchorTop),
    estimateBottomOffset: () =>
      estimateInitialOffsetAtBottomPx(estimateState, options),
  });
}

function createVirtualizerOptionsComputed(
  options: UseMessageListVirtualizerOptions,
  estimateState: EstimateState,
  cache: ShallowRef<VirtualItem[]>,
  overscan: ComputedRef<number>,
  paddingStart: ComputedRef<number>,
) {
  return computed(() => ({
    count: options.virtualizerOrderedIds.value.length,
    getScrollElement: () => options.getContainer(),
    estimateSize: (index: number) =>
      estimateMessageRowSize(estimateState, index),
    overscan: overscan.value,
    useCachedMeasurements: true,
    initialMeasurementsCache: cache.value,
    scrollPaddingStart: paddingStart.value,
    scrollPaddingEnd: 16,
    getItemKey: (index: number) =>
      options.virtualizerOrderedIds.value[index] ?? '',
    orderKey: `${options.getChannelId()?.trim() ?? ''}:${options.displayOrderedIds.value.length > 0 ? 'm' : 'e'}`,
    initialOffset: () =>
      resolveVirtualizerInitialOffset(options, estimateState),
    shouldAdjustScrollPositionOnItemSizeChange: (
      item: { start: number },
      delta: number,
      instance: {
        scrollOffset: number | null;
        scrollDirection?: string | null;
      },
    ) => resolveCompensationOnItemSizeChange(options, item, delta, instance),
  }));
}

export function useMessageListVirtualizer(
  options: UseMessageListVirtualizerOptions,
) {
  const estimateState: EstimateState = options;
  const resolveOverscan = () =>
    resolveMessageListOverscanPx({
      olderFetchSkeletonActive: options.olderFetchSkeletonActive.value,
      coarsePointer: options.coarsePointer.value,
      safariLikeBrowser: options.safariLikeBrowser,
    });
  const overscan = computed(resolveOverscan);
  const paddingStart = computed(
    () => options.scrollContainerPaddingTopPx.value,
  );
  const cache = shallowRef(
    buildInitialMeasurementsCacheForChannel(
      options.getChannelId(),
      options.virtualizerOrderedIds.value,
      (index) => estimateMessageRowSize(estimateState, index),
      () => false,
    ),
  );
  watchMeasurementsCache(options, estimateState, cache);
  const virtualizer = useVirtualizer(
    createVirtualizerOptionsComputed(
      options,
      estimateState,
      cache,
      overscan,
      paddingStart,
    ) as Parameters<typeof useVirtualizer>[0],
  );
  return {
    virtualizer,
    virtualizerTotalSize: computed(() => virtualizer.value.getTotalSize()),
    virtualizerItems: computed(() => virtualizer.value.getVirtualItems()),
    resolveMessageListOverscan: resolveOverscan,
    revisionKeyForMessageIndex: (messageIndex: number) =>
      revisionKeyForMessageIndex(estimateState, messageIndex),
    estimateMessageRowSizeForMessage: (messageIndex: number) =>
      estimateMessageRowSizeForMessage(estimateState, messageIndex),
    estimateMessageRowSize: (virtualIndex: number) =>
      estimateMessageRowSize(estimateState, virtualIndex),
  };
}
