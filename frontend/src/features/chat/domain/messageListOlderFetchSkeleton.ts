import { computed, type ComputedRef, type Ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { buildHistorySkeletonRowsFromMessages } from '../components/buildHistorySkeletonRowsFromMessages';
import {
  OLDER_FETCH_LOADING_HEADER_PX,
  OLDER_FETCH_SKELETON_ROW_COUNT,
  OLDER_FETCH_SKELETON_ROWS,
  estimateHistorySkeletonRowSizePx,
  type HistorySkeletonRow,
} from '../components/messageListHistorySkeleton';

/** Synthetic virtual-row keys prepended while older history is in flight. */
export const PREPEND_SKELETON_KEY_PREFIX = '__prepend_sk__';

export function resolveHistorySkeletonAuthorName(
  authorId: string,
  mergedEntities: Map<string, RawMessage>,
  propsMessages: Map<string, RawMessage>,
): string {
  for (const msg of mergedEntities.values()) {
    if (msg.authorId === authorId && msg.authorDisplayName?.trim()) {
      return msg.authorDisplayName.trim();
    }
  }
  for (const msg of propsMessages.values()) {
    if (msg.authorId === authorId) {
      const enriched = msg as MessageWithAuthor & {
        authorName?: string;
        author?: { name?: string };
      };
      const name = enriched.authorName ?? enriched.author?.name;
      if (name?.trim()) return name.trim();
    }
  }
  return 'Member';
}

/**
 * Prefer cached messages strictly older than the current window head so scroll-up
 * placeholders mirror what is likely incoming, not the boundary row already visible.
 */
export function resolveOlderFetchSkeletonSourceMessages(
  displayOrderedIds: readonly string[],
  mergedEntities: Map<string, RawMessage>,
  cachedMessages: readonly RawMessage[] | undefined,
): readonly RawMessage[] {
  const headId = displayOrderedIds[0]?.trim();
  if (!headId || !cachedMessages?.length) return [];

  const headIdx = cachedMessages.findIndex((m) => m.id?.trim() === headId);
  if (headIdx <= 0) return [];

  const older = cachedMessages.slice(0, headIdx);
  return older.slice(-OLDER_FETCH_SKELETON_ROW_COUNT);
}

export function buildOlderFetchSkeletonRows(
  displayOrderedIds: readonly string[],
  mergedEntities: Map<string, RawMessage>,
  propsMessages: Map<string, RawMessage>,
  userId: string | undefined,
  channelId: string | undefined,
): HistorySkeletonRow[] {
  void userId;
  void channelId;
  const cached: readonly RawMessage[] | undefined = undefined;

  const source = resolveOlderFetchSkeletonSourceMessages(
    displayOrderedIds,
    mergedEntities,
    cached,
  );
  if (source.length > 0) {
    const rows = buildHistorySkeletonRowsFromMessages(
      source,
      (authorId) =>
        resolveHistorySkeletonAuthorName(
          authorId,
          mergedEntities,
          propsMessages,
        ),
      { edge: 'tail' },
    );
    if (rows.length > 0) return rows.slice(0, OLDER_FETCH_SKELETON_ROW_COUNT);
  }

  return OLDER_FETCH_SKELETON_ROWS;
}

export type MessageListOlderFetchSkeletonState = {
  olderFetchSkeletonActive: Ref<boolean>;
  displayOrderedIds: ComputedRef<string[]>;
  mergedEntitiesForList: ComputedRef<Map<string, RawMessage>>;
  propsMessages: ComputedRef<Map<string, RawMessage>>;
  currentUserId: ComputedRef<string | undefined>;
  channelId: ComputedRef<string | undefined>;
};

export function useMessageListOlderFetchSkeleton(
  state: MessageListOlderFetchSkeletonState,
) {
  const olderHistorySkeletonRows = computed((): HistorySkeletonRow[] => {
    if (!state.olderFetchSkeletonActive.value) return [];
    return buildOlderFetchSkeletonRows(
      state.displayOrderedIds.value,
      state.mergedEntitiesForList.value,
      state.propsMessages.value,
      state.currentUserId.value,
      state.channelId.value,
    );
  });

  const prependSkeletonSlotCount = computed(() =>
    state.olderFetchSkeletonActive.value
      ? olderHistorySkeletonRows.value.length
      : 0,
  );

  const virtualizerOrderedIds = computed(() => {
    if (!state.olderFetchSkeletonActive.value) {
      return state.displayOrderedIds.value;
    }
    const slotKeys = olderHistorySkeletonRows.value.map(
      (_, i) => `${PREPEND_SKELETON_KEY_PREFIX}${i}`,
    );
    return [...slotKeys, ...state.displayOrderedIds.value];
  });

  function isPrependSkeletonVirtualIndex(index: number): boolean {
    return index < prependSkeletonSlotCount.value;
  }

  function virtualIndexToMessageIndex(virtualIndex: number): number {
    return virtualIndex - prependSkeletonSlotCount.value;
  }

  function estimatePrependSkeletonRowSizePx(
    virtualIndex: number,
    defaultPx: number,
  ): number {
    if (virtualIndex === 0) {
      const row = olderHistorySkeletonRows.value[0];
      return (
        OLDER_FETCH_LOADING_HEADER_PX +
        (row ? estimateHistorySkeletonRowSizePx(row) : defaultPx)
      );
    }
    const row = olderHistorySkeletonRows.value[virtualIndex];
    return row ? estimateHistorySkeletonRowSizePx(row) : defaultPx;
  }

  return {
    olderHistorySkeletonRows,
    prependSkeletonSlotCount,
    virtualizerOrderedIds,
    isPrependSkeletonVirtualIndex,
    virtualIndexToMessageIndex,
    estimatePrependSkeletonRowSizePx,
  };
}
