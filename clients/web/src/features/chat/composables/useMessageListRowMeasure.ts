/**
 * Message list — **row measurement scheduling authority**.
 *
 * Owns deferred/pending measure keys, resize-defer metrics, and the schedule /
 * flush paths. Actual height commit (virtualizer + estimate logging) stays with
 * the caller via {@link UseMessageListRowMeasureOptions.commitVirtualRowMeasure}.
 */

import { nextTick } from 'vue';
import {
  createResizeDeferMetrics,
  resolveResizeMeasureAction,
  type ResizeDeferMetricsSlice,
} from '@/features/chat/domain/messageListResizeDefer';
import { MESSAGE_LIST_RESIZE_MEASURE_DEFER } from '@/features/chat/domain/messageListScrollPolicy';
import {
  noteSubtractionResizeFlush,
  noteSubtractionResizeSchedule,
  noteSubtractionDeferredWithOverflow,
} from '@/features/chat/domain/messageListSubtractionDiagnostics';
import { messageListScrollMetricsApi } from '@/features/chat/composables/messageListScrollMetrics';
import {
  logMessageList,
  messageListDebugEnabled,
} from '@/features/chat/composables/messageListDebugLog';

export type RowMeasureGeometry = {
  rowTopInContainerPx: number | null;
  rowBottomInContainerPx: number | null;
  scrollContainerClientHeightPx: number;
};

export type UseMessageListRowMeasureOptions = {
  getChannelId: () => string;
  isUserScrollActive: () => boolean;
  deferFullRowHydration: () => boolean;
  prependTransactionActive: () => boolean;
  getRowMeasureGeometry: (element: Element) => RowMeasureGeometry;
  getVirtualRowElement: (key: string) => Element | undefined;
  measureKeyForElement: (element: Element) => string;
  /** Caller-owned commit (estimate logging + virtualizer.measureElement). */
  commitVirtualRowMeasure: (element: Element, source: 'ref' | 'resize') => void;
  now: () => number;
};

type MeasureState = {
  resizeDeferMetrics: ResizeDeferMetricsSlice;
  unresolvedResizeDeltaByKey: Map<string, number>;
  measureRowPendingKeys: Set<string>;
  measureRowLastHeightByKey: Map<string, number>;
  rowResizeMeasureDeferredKeys: Set<string>;
  options: UseMessageListRowMeasureOptions;
};

function maybeDeferResizeMeasure(
  state: MeasureState,
  element: Element,
  source: 'ref' | 'resize',
  deferKey: string,
  force: boolean,
): boolean {
  if (source !== 'resize' || !MESSAGE_LIST_RESIZE_MEASURE_DEFER || force) {
    return false;
  }
  const geom = state.options.getRowMeasureGeometry(element);
  const unresolved = deferKey
    ? (state.unresolvedResizeDeltaByKey.get(deferKey) ?? 0)
    : 0;
  const slotH = deferKey
    ? (state.measureRowLastHeightByKey.get(deferKey) ?? null)
    : null;
  const decision = resolveResizeMeasureAction({
    source,
    isUserScrollActive: state.options.isUserScrollActive(),
    deferFullRowHydration: state.options.deferFullRowHydration(),
    experimentEnabled: MESSAGE_LIST_RESIZE_MEASURE_DEFER,
    prependTransactionActive: state.options.prependTransactionActive(),
    programmaticScrollPending: false,
    rowTopInContainerPx: geom.rowTopInContainerPx,
    rowBottomInContainerPx: geom.rowBottomInContainerPx,
    scrollContainerClientHeightPx: geom.scrollContainerClientHeightPx,
    lastKnownSlotHeightPx: slotH,
    contentHeightPx: element.getBoundingClientRect().height,
    unresolvedDeltaPx: unresolved,
  });
  if (decision.action === 'defer') {
    if (deferKey) state.rowResizeMeasureDeferredKeys.add(deferKey);
    state.resizeDeferMetrics.measureDeferredCount++;
    const contentH = element.getBoundingClientRect().height;
    if (slotH != null && slotH > 0 && contentH > slotH + 0.5) {
      noteSubtractionDeferredWithOverflow(contentH - slotH);
    }
    return true;
  }
  state.resizeDeferMetrics.measureNowCount++;
  return false;
}

function scheduleVirtualRowMeasure(
  state: MeasureState,
  element: Element,
  source: 'ref' | 'resize',
  scheduleOptions: { force?: boolean } = {},
): void {
  noteSubtractionResizeSchedule();
  const cid = state.options.getChannelId();
  const deferKey = cid ? state.options.measureKeyForElement(element) : '';
  if (
    maybeDeferResizeMeasure(
      state,
      element,
      source,
      deferKey,
      !!scheduleOptions.force,
    )
  ) {
    return;
  }

  if (deferKey && state.measureRowPendingKeys.has(deferKey)) {
    if (messageListDebugEnabled()) {
      logMessageList('measure', 'row_measure_defer_deduped', {
        deferKey,
        source,
      });
    }
    return;
  }
  if (deferKey) state.measureRowPendingKeys.add(deferKey);
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (deferKey) state.measureRowPendingKeys.delete(deferKey);
      if (!element.isConnected) return;
      state.options.commitVirtualRowMeasure(element, source);
    });
  });
}

function flushDeferredRowResizeMeasures(state: MeasureState): void {
  const t0 = state.options.now();
  noteSubtractionResizeFlush();
  state.resizeDeferMetrics.deferredKeysAtSettle =
    state.rowResizeMeasureDeferredKeys.size;
  if (state.rowResizeMeasureDeferredKeys.size === 0) return;
  const keys = [...state.rowResizeMeasureDeferredKeys];
  state.rowResizeMeasureDeferredKeys.clear();
  for (const key of keys) {
    state.unresolvedResizeDeltaByKey.delete(key);
    const rowEl = state.options.getVirtualRowElement(key);
    if (rowEl) {
      scheduleVirtualRowMeasure(state, rowEl, 'resize', { force: true });
    }
  }
  const dur = state.options.now() - t0;
  state.resizeDeferMetrics.settleFlushDurationMs = dur;
  state.resizeDeferMetrics.settleFlushDurationMaxMs = Math.max(
    state.resizeDeferMetrics.settleFlushDurationMaxMs,
    dur,
  );
  messageListScrollMetricsApi()?.mergeResizeDeferMetrics(
    state.resizeDeferMetrics,
  );
}

export function useMessageListRowMeasure(
  options: UseMessageListRowMeasureOptions,
) {
  const state: MeasureState = {
    resizeDeferMetrics: createResizeDeferMetrics(),
    unresolvedResizeDeltaByKey: new Map(),
    measureRowPendingKeys: new Set(),
    measureRowLastHeightByKey: new Map(),
    rowResizeMeasureDeferredKeys: new Set(),
    options,
  };

  return {
    resizeDeferMetrics: state.resizeDeferMetrics,
    unresolvedResizeDeltaByKey: state.unresolvedResizeDeltaByKey,
    measureRowPendingKeys: state.measureRowPendingKeys,
    measureRowLastHeightByKey: state.measureRowLastHeightByKey,
    rowResizeMeasureDeferredKeys: state.rowResizeMeasureDeferredKeys,
    scheduleVirtualRowMeasure: (
      element: Element,
      source: 'ref' | 'resize',
      scheduleOptions?: { force?: boolean },
    ) => scheduleVirtualRowMeasure(state, element, source, scheduleOptions),
    flushDeferredRowResizeMeasures: () => flushDeferredRowResizeMeasures(state),
    clearMeasureStateForChannelSwitch: () => {
      state.measureRowPendingKeys.clear();
      state.measureRowLastHeightByKey.clear();
    },
    invalidateMeasureKey: (measureKey: string) => {
      state.measureRowLastHeightByKey.delete(measureKey);
      state.measureRowPendingKeys.delete(measureKey);
    },
    clearDeferredResizeKeys: () => {
      state.rowResizeMeasureDeferredKeys.clear();
    },
  };
}
