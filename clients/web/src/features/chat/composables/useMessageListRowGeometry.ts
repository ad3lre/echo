/**
 * Message list — **visible-row geometry after mount**.
 *
 * Owns remasure of patched/KaTeX rows, virtualizer visible-id metrics, and the
 * height-commit path into TanStack. Does not own prepend TX, initial-anchor, or
 * programmatic scroll writes.
 */

import { nextTick, watch, type ComputedRef, type Ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { MessageListRowPresentation } from '@/features/chat/domain/messageListRowPresentation';
import {
  invalidateMessageRowHeight,
  setMessageRowHeightPx,
} from '@/features/chat/domain/messageRowHeightStore';
import {
  markdownKatexReadyVersion,
  isMarkdownKatexReady,
} from '@/features/chat/markdown/markdownKatex';
import { hasMarkdownMathRegions } from '@/features/chat/markdown/markdownMathRegions';
import { plainTextForMessageFields } from '@/features/chat/domain/messageDisplayPlain';
import {
  noteSubtractionChannelVisibleIds,
  noteSubtractionMeasureElement,
  noteSubtractionRowMount,
  noteSubtractionRowUnmount,
} from '@/features/chat/domain/messageListSubtractionDiagnostics';
import { messageListScrollMetricsApi } from '@/features/chat/composables/messageListScrollMetrics';
import {
  logMessageList,
  messageListDebugEnabled,
} from '@/features/chat/composables/messageListDebugLog';
import {
  measureKeyForElement,
  resolveMeasureRowElement,
} from '@/features/chat/composables/useMessageListVirtualRowObservation';
import { flashMessageHighlightInRoot } from '@/features/chat/composables/messageListFlashHighlight';

export type VisibleVirtualRow = { index: number; key?: unknown };

export type UseMessageListRowGeometryOptions = {
  getContainer: () => HTMLElement | null;
  getChannelId: () => string | undefined;
  getVirtualItems: () => readonly VisibleVirtualRow[];
  virtualizerItems:
    | Ref<readonly VisibleVirtualRow[]>
    | ComputedRef<readonly VisibleVirtualRow[]>;
  measureElement: (element: Element) => void;
  isPrependSkeletonVirtualIndex: (virtualIndex: number) => boolean;
  virtualIndexToMessageIndex: (virtualIndex: number) => number;
  messageIdForVirtualIndex: (virtualIndex: number) => string | null;
  displayOrderedIds: Ref<readonly string[]> | ComputedRef<readonly string[]>;
  messageListRowPresentations:
    | Ref<readonly MessageListRowPresentation[]>
    | ComputedRef<readonly MessageListRowPresentation[]>;
  mergedMessagesForList:
    | Ref<Map<string, MessageWithAuthor>>
    | ComputedRef<Map<string, MessageWithAuthor>>;
  virtualRowElementByKey: Map<string, Element>;
  scheduleVirtualRowMeasure: (
    element: Element,
    source: 'ref' | 'resize',
    opts?: { force?: boolean },
  ) => void;
  syncVirtualRowResizeObservation: (
    element: Element,
    virtualIndex: number,
  ) => void;
  detachVirtualRowResizeObservation: (virtualIndex: number) => void;
  invalidateMeasureKey: (measureKey: string) => void;
  measureRowLastHeightByKey: Map<string, number>;
  revisionKeyForMessageIndex: (messageIndex: number) => string | null;
  estimateMessageRowSizeForMessage: (messageIndex: number) => number;
  estimateMessageRowSize: (virtualIndex: number) => number;
};

type VisibleIdSource = Pick<
  UseMessageListRowGeometryOptions,
  'isPrependSkeletonVirtualIndex' | 'messageIdForVirtualIndex'
>;

function eachVisibleMessageId(
  source: VisibleIdSource,
  items: readonly VisibleVirtualRow[],
  visit: (messageId: string, virtualIndex: number) => void,
): void {
  for (const item of items) {
    if (source.isPrependSkeletonVirtualIndex(item.index)) continue;
    const messageId = source.messageIdForVirtualIndex(item.index);
    if (messageId) visit(messageId, item.index);
  }
}

export function collectVisibleMathMessageIds(
  options: VisibleIdSource &
    Pick<UseMessageListRowGeometryOptions, 'mergedMessagesForList'>,
  items: readonly VisibleVirtualRow[],
): string[] {
  const ids: string[] = [];
  eachVisibleMessageId(options, items, (messageId) => {
    const message = options.mergedMessagesForList.value.get(messageId);
    if (!message) return;
    const body = plainTextForMessageFields(message);
    if (hasMarkdownMathRegions(body)) ids.push(messageId);
  });
  return ids;
}

function invalidateRowMeasureStateForMessage(
  options: UseMessageListRowGeometryOptions,
  channelId: string,
  messageId: string,
): void {
  invalidateMessageRowHeight(channelId, messageId);
  options.invalidateMeasureKey(`${channelId}:${messageId}`);
}

function remeasureVisibleVirtualRows(
  options: UseMessageListRowGeometryOptions,
  force = false,
): void {
  const cid = options.getChannelId()?.trim();
  if (!cid) return;
  eachVisibleMessageId(options, options.getVirtualItems(), (messageId) => {
    if (force) invalidateRowMeasureStateForMessage(options, cid, messageId);
    const rowEl = options.virtualRowElementByKey.get(`${cid}:${messageId}`);
    if (rowEl) {
      options.scheduleVirtualRowMeasure(rowEl, 'resize', { force });
    }
  });
}

function remasurePatchedVisibleRows(
  options: UseMessageListRowGeometryOptions,
  cid: string,
  idSet: Set<string>,
): void {
  if (!options.getContainer()) return;
  eachVisibleMessageId(
    options,
    options.getVirtualItems(),
    (messageId, index) => {
      if (!idSet.has(messageId)) return;
      const rowEl = options.virtualRowElementByKey.get(`${cid}:${messageId}`);
      if (!rowEl) return;
      options.syncVirtualRowResizeObservation(rowEl, index);
      options.scheduleVirtualRowMeasure(rowEl, 'resize', { force: true });
    },
  );
}

function scheduleContentPatchRemeasure(
  options: UseMessageListRowGeometryOptions,
  messageIds: readonly string[],
): void {
  const cid = options.getChannelId()?.trim();
  if (!cid || messageIds.length === 0) return;
  const idSet = new Set(messageIds.map((id) => id.trim()).filter(Boolean));
  eachVisibleMessageId(options, options.getVirtualItems(), (messageId) => {
    if (idSet.has(messageId)) {
      invalidateRowMeasureStateForMessage(options, cid, messageId);
    }
  });
  void nextTick(() => {
    requestAnimationFrame(() =>
      remasurePatchedVisibleRows(options, cid, idSet),
    );
  });
}

function remasureVisibleMathRowsAfterKatexReady(
  options: UseMessageListRowGeometryOptions,
): void {
  if (!isMarkdownKatexReady()) return;
  const ids = collectVisibleMathMessageIds(options, options.getVirtualItems());
  if (ids.length > 0) scheduleContentPatchRemeasure(options, ids);
}

function watchVirtualizerVisibleRange(
  options: UseMessageListRowGeometryOptions,
): void {
  let prevSignature = '';
  watch(options.virtualizerItems, (items) => {
    const sig = items.map((i) => String(i.key ?? '')).join(',');
    if (sig !== prevSignature) {
      prevSignature = sig;
      messageListScrollMetricsApi()?.noteVirtualizerRangeChange();
    }
    messageListScrollMetricsApi()?.noteMountedRowCount(items.length);
    const visibleIds: string[] = [];
    eachVisibleMessageId(options, items, (messageId) => {
      visibleIds.push(messageId);
    });
    noteSubtractionChannelVisibleIds(visibleIds);
  });
}

function watchKatexReadyRemeasure(
  options: UseMessageListRowGeometryOptions,
): void {
  watch(markdownKatexReadyVersion, () => {
    remasureVisibleMathRowsAfterKatexReady(options);
  });
}

function logRowHeightEstMismatch(
  options: UseMessageListRowGeometryOptions,
  args: {
    messageIndex: number;
    idx: number;
    messageId: string | null;
    heightPx: number;
    source: 'ref' | 'resize';
  },
): void {
  const rowVm = Number.isFinite(args.messageIndex)
    ? (options.messageListRowPresentations.value[args.messageIndex] ?? null)
    : null;
  const est =
    Number.isFinite(args.messageIndex) &&
    args.messageIndex >= 0 &&
    args.messageIndex < options.displayOrderedIds.value.length
      ? options.estimateMessageRowSizeForMessage(args.messageIndex)
      : options.isPrependSkeletonVirtualIndex(args.idx)
        ? options.estimateMessageRowSize(args.idx)
        : null;
  if (est == null || Math.abs(est - args.heightPx) < 24) return;
  messageListScrollMetricsApi()?.noteEstMismatch();
  logMessageList('measure', 'row_height_est_mismatch', {
    channelId: options.getChannelId() ?? null,
    messageId: args.messageId,
    index: Number.isFinite(args.idx) ? args.idx : null,
    measuredPx: Math.round(args.heightPx),
    estimatePx: Math.round(est),
    deltaPx: Math.round(args.heightPx - est),
    groupedWithPrevious: rowVm?.layout.groupedWithPrevious ?? null,
    showDaySeparatorBefore: rowVm?.showDaySeparatorBefore ?? null,
    showUnreadSeparatorBefore: rowVm?.showUnreadSeparatorBefore ?? null,
    compactTop: rowVm?.isCompact ?? null,
    source: args.source,
  });
}

function commitVirtualRowMeasure(
  options: UseMessageListRowGeometryOptions,
  element: Element,
  source: 'ref' | 'resize',
): void {
  const cid = options.getChannelId()?.trim() ?? '';
  const idxAttr = element.getAttribute('data-index');
  const idx = idxAttr != null ? Number(idxAttr) : NaN;
  const messageIndex = Number.isFinite(idx)
    ? options.virtualIndexToMessageIndex(idx)
    : -1;
  const messageId =
    messageIndex >= 0
      ? (options.displayOrderedIds.value[messageIndex] ?? null)
      : null;
  const revisionKey =
    messageIndex >= 0 ? options.revisionKeyForMessageIndex(messageIndex) : null;
  const deferKey = measureKeyForElement(element);
  const h = element.getBoundingClientRect().height;
  const prev = deferKey
    ? options.measureRowLastHeightByKey.get(deferKey)
    : undefined;
  if (prev !== undefined && Math.abs(prev - h) < 0.5) return;
  if (messageListDebugEnabled()) {
    logRowHeightEstMismatch(options, {
      messageIndex,
      idx,
      messageId,
      heightPx: h,
      source,
    });
  }
  if (deferKey) options.measureRowLastHeightByKey.set(deferKey, h);
  if (messageId && revisionKey) {
    setMessageRowHeightPx(cid, messageId, h, revisionKey);
  }
  noteSubtractionMeasureElement(
    deferKey || `${cid}:${messageId ?? ''}`,
    revisionKey,
  );
  options.measureElement(element);
  messageListScrollMetricsApi()?.noteMeasureEvent();
}

function measureRowRefForIndex(
  options: UseMessageListRowGeometryOptions,
  el: Element | ComponentPublicInstance | null,
  virtualIndex: number,
): void {
  const messageId = options.messageIdForVirtualIndex(virtualIndex);
  if (!el) {
    noteSubtractionRowUnmount(messageId);
    options.detachVirtualRowResizeObservation(virtualIndex);
    return;
  }
  const element = resolveMeasureRowElement(el);
  if (!element) return;
  noteSubtractionRowMount(messageId);
  options.syncVirtualRowResizeObservation(element, virtualIndex);
  options.scheduleVirtualRowMeasure(element, 'ref');
}

function flashMessageHighlight(
  options: UseMessageListRowGeometryOptions,
  messageId: string,
): void {
  void nextTick(() =>
    flashMessageHighlightInRoot(options.getContainer(), messageId),
  );
}

export function useMessageListRowGeometry(
  options: UseMessageListRowGeometryOptions,
) {
  watchVirtualizerVisibleRange(options);
  watchKatexReadyRemeasure(options);
  return {
    remeasureVisibleVirtualRows: (opts?: { force?: boolean }) =>
      remeasureVisibleVirtualRows(options, !!opts?.force),
    scheduleContentPatchRemeasure: (messageIds: readonly string[]) =>
      scheduleContentPatchRemeasure(options, messageIds),
    commitVirtualRowMeasure: (element: Element, source: 'ref' | 'resize') =>
      commitVirtualRowMeasure(options, element, source),
    measureRowRefForIndex: (
      el: Element | ComponentPublicInstance | null,
      virtualIndex: number,
    ) => measureRowRefForIndex(options, el, virtualIndex),
    flashMessageHighlight: (messageId: string) =>
      flashMessageHighlight(options, messageId),
  };
}
