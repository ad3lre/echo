/**
 * Client-side scroll gesture metrics for message list perf experiments.
 * Exposed as `window.__echoMessageListScrollMetrics` when harness or debug is on.
 */

import type { ScrollCompensationMetricsSlice } from '@/features/chat/domain/messageListScrollCompensation';
import type { ResizeDeferMetricsSlice } from '@/features/chat/domain/messageListResizeDefer';

export type MessageListScrollMetricsReport = {
  scenario: string;
  fixture: 'geometry' | 'scale' | 'history' | 'default';
  recordedAt: string;
  scrollHandlerMs: { p50: number; p95: number; max: number; samples: number };
  longFrameCount: number;
  longFrameMsTotal: number;
  measureEventCount: number;
  rowHeightEstMismatchCount: number;
  rowPresentationRebuildMsMax: number;
  mountedRowCountMax: number;
  rowMountCount: number;
  rowUnmountCount: number;
  virtualizerRangeChangeCount: number;
  compensation: ScrollCompensationMetricsSlice;
  resizeDefer: ResizeDeferMetricsSlice;
  slotOverlapCount: number;
  slotOverflowCount: number;
  blankViewportSamples: number;
  prependAnchorErrorPx: number;
  largestPostSettleCorrectionPx: number;
  anchorDisplacementPxMax: number;
};

type EchoMessageListScrollMetricsWindow = Window & {
  __echoMessageListScrollMetrics?: {
    getReport: () => MessageListScrollMetricsReport;
    reset: () => void;
    isEnabled: () => boolean;
    noteScrollHandlerDuration: (ms: number) => void;
    noteLongFrame: (ms: number) => void;
    noteMeasureEvent: () => void;
    noteEstMismatch: () => void;
    noteRowPresentationRebuild: (ms: number) => void;
    noteMountedRowCount: (n: number) => void;
    noteRowMount: () => void;
    noteRowUnmount: () => void;
    noteVirtualizerRangeChange: () => void;
    noteLayoutSample: (sample: Partial<MessageListScrollMetricsReport>) => void;
    setScenario: (
      scenario: string,
      fixture: MessageListScrollMetricsReport['fixture'],
    ) => void;
    mergeCompensationMetrics: (m: ScrollCompensationMetricsSlice) => void;
    mergeResizeDeferMetrics: (m: ResizeDeferMetricsSlice) => void;
  };
};

let enabled = false;
let scenario = 'default';
let fixture: MessageListScrollMetricsReport['fixture'] = 'default';

const scrollHandlerSamples: number[] = [];
let longFrameCount = 0;
let longFrameMsTotal = 0;
let measureEventCount = 0;
let rowHeightEstMismatchCount = 0;
let rowPresentationRebuildMsMax = 0;
let mountedRowCountMax = 0;
let rowMountCount = 0;
let rowUnmountCount = 0;
let virtualizerRangeChangeCount = 0;

let compensationMetrics: ScrollCompensationMetricsSlice = {
  compensationEventCount: 0,
  compensationDuringGestureCount: 0,
  compensationAfterSettleCount: 0,
  totalAbsoluteCorrectionPx: 0,
  maxSingleCorrectionPx: 0,
  correctionsOpposingWheelCount: 0,
};

let resizeDeferMetrics: ResizeDeferMetricsSlice = {
  resizeObserverCallbackCount: 0,
  measureNowCount: 0,
  measureDeferredCount: 0,
  deferredKeysAtSettle: 0,
  settleFlushDurationMs: 0,
  settleFlushDurationMaxMs: 0,
};

const layoutSample: Partial<MessageListScrollMetricsReport> = {};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

export function isMessageListScrollMetricsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (enabled) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scrollMetrics') === '1') return true;
    if (localStorage.getItem('echo_message_list_scroll_metrics') === '1') {
      return true;
    }
    if (localStorage.getItem('echo_message_list_debug') === '1') return true;
    if (localStorage.getItem('echo_perf_harness') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

function buildReport(): MessageListScrollMetricsReport {
  const sorted = [...scrollHandlerSamples].sort((a, b) => a - b);
  return {
    scenario,
    fixture,
    recordedAt: new Date().toISOString(),
    scrollHandlerMs: {
      p50: Math.round(percentile(sorted, 50) * 100) / 100,
      p95: Math.round(percentile(sorted, 95) * 100) / 100,
      max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
      samples: sorted.length,
    },
    longFrameCount,
    longFrameMsTotal: Math.round(longFrameMsTotal * 100) / 100,
    measureEventCount,
    rowHeightEstMismatchCount,
    rowPresentationRebuildMsMax:
      Math.round(rowPresentationRebuildMsMax * 100) / 100,
    mountedRowCountMax,
    rowMountCount,
    rowUnmountCount,
    virtualizerRangeChangeCount,
    compensation: { ...compensationMetrics },
    resizeDefer: { ...resizeDeferMetrics },
    slotOverlapCount: layoutSample.slotOverlapCount ?? 0,
    slotOverflowCount: layoutSample.slotOverflowCount ?? 0,
    blankViewportSamples: layoutSample.blankViewportSamples ?? 0,
    prependAnchorErrorPx: layoutSample.prependAnchorErrorPx ?? 0,
    largestPostSettleCorrectionPx:
      layoutSample.largestPostSettleCorrectionPx ??
      compensationMetrics.maxSingleCorrectionPx,
    anchorDisplacementPxMax: layoutSample.anchorDisplacementPxMax ?? 0,
  };
}

export function resetMessageListScrollMetrics(): void {
  scrollHandlerSamples.length = 0;
  longFrameCount = 0;
  longFrameMsTotal = 0;
  measureEventCount = 0;
  rowHeightEstMismatchCount = 0;
  rowPresentationRebuildMsMax = 0;
  mountedRowCountMax = 0;
  rowMountCount = 0;
  rowUnmountCount = 0;
  virtualizerRangeChangeCount = 0;
  compensationMetrics = {
    compensationEventCount: 0,
    compensationDuringGestureCount: 0,
    compensationAfterSettleCount: 0,
    totalAbsoluteCorrectionPx: 0,
    maxSingleCorrectionPx: 0,
    correctionsOpposingWheelCount: 0,
  };
  resizeDeferMetrics = {
    resizeObserverCallbackCount: 0,
    measureNowCount: 0,
    measureDeferredCount: 0,
    deferredKeysAtSettle: 0,
    settleFlushDurationMs: 0,
    settleFlushDurationMaxMs: 0,
  };
  for (const k of Object.keys(layoutSample)) {
    delete layoutSample[k as keyof typeof layoutSample];
  }
}

export function installMessageListScrollMetrics(force = false): void {
  if (typeof window === 'undefined') return;
  enabled = force || isMessageListScrollMetricsEnabled();
  if (!enabled) return;

  const w = window as EchoMessageListScrollMetricsWindow;
  if (w.__echoMessageListScrollMetrics) return;

  w.__echoMessageListScrollMetrics = {
    getReport: buildReport,
    reset: resetMessageListScrollMetrics,
    isEnabled: () => enabled,
    noteScrollHandlerDuration(ms: number) {
      scrollHandlerSamples.push(ms);
      if (scrollHandlerSamples.length > 5000) scrollHandlerSamples.shift();
    },
    noteLongFrame(ms: number) {
      if (ms > 16.7) {
        longFrameCount++;
        longFrameMsTotal += ms;
      }
    },
    noteMeasureEvent() {
      measureEventCount++;
    },
    noteEstMismatch() {
      rowHeightEstMismatchCount++;
    },
    noteRowPresentationRebuild(ms: number) {
      rowPresentationRebuildMsMax = Math.max(rowPresentationRebuildMsMax, ms);
    },
    noteMountedRowCount(n: number) {
      mountedRowCountMax = Math.max(mountedRowCountMax, n);
    },
    noteRowMount() {
      rowMountCount++;
    },
    noteRowUnmount() {
      rowUnmountCount++;
    },
    noteVirtualizerRangeChange() {
      virtualizerRangeChangeCount++;
    },
    noteLayoutSample(sample: Partial<MessageListScrollMetricsReport>) {
      Object.assign(layoutSample, sample);
    },
    setScenario(
      nextScenario: string,
      nextFixture: MessageListScrollMetricsReport['fixture'],
    ) {
      scenario = nextScenario;
      fixture = nextFixture;
    },
    mergeCompensationMetrics(m: ScrollCompensationMetricsSlice) {
      compensationMetrics = { ...m };
    },
    mergeResizeDeferMetrics(m: ResizeDeferMetricsSlice) {
      resizeDeferMetrics = { ...m };
    },
  };
}

export function messageListScrollMetricsApi():
  | EchoMessageListScrollMetricsWindow['__echoMessageListScrollMetrics']
  | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as EchoMessageListScrollMetricsWindow)
      .__echoMessageListScrollMetrics ?? null
  );
}
