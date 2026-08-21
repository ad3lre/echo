/**
 * Message list — **virtual row ResizeObserver authority**.
 *
 * Owns attach/detach of hydrated row roots, measure-key sync, and the
 * ResizeObserver callback that records unresolved height delta then schedules
 * a measure. Does not own measure deferral, virtualizer commits, or prepend TX.
 */

import type { ComponentPublicInstance } from 'vue';
import {
  computeUnresolvedResizeDeltaPx,
  type ResizeDeferMetricsSlice,
} from '@/features/chat/domain/messageListResizeDefer';

export type UseMessageListVirtualRowObservationOptions = {
  getChannelId: () => string;
  messageIdForVirtualIndex: (virtualIndex: number) => string | null;
  scheduleVirtualRowMeasure: (
    element: Element,
    source: 'ref' | 'resize',
  ) => void;
  getResizeDeferMetrics: () => ResizeDeferMetricsSlice;
  getUnresolvedResizeDeltaByKey: () => Map<string, number>;
  getMeasureRowLastHeightByKey: () => Map<string, number>;
  clearDeferredResizeKeys: () => void;
};

type ObservationState = {
  virtualRowElementByKey: Map<string, Element>;
  observedElements: Set<Element>;
  observer: ResizeObserver | null;
  options: UseMessageListVirtualRowObservationOptions;
};

export function resolveMeasureRowElement(
  el: Element | ComponentPublicInstance | null,
): Element | null {
  if (!el) return null;
  const node =
    typeof el === 'object' && '$el' in el
      ? (el as ComponentPublicInstance).$el
      : el;
  return node instanceof Element ? node : null;
}

export function measureKeyForElement(element: Element): string {
  return element.getAttribute('data-measure-key')?.trim() ?? '';
}

function measureKeyForVirtualIndex(
  state: ObservationState,
  virtualIndex: number,
): string {
  const cid = state.options.getChannelId();
  const messageId = state.options.messageIdForVirtualIndex(virtualIndex);
  return cid && messageId ? `${cid}:${messageId}` : '';
}

function unobserveVirtualRowElement(
  state: ObservationState,
  element: Element,
): void {
  if (!state.observedElements.has(element)) return;
  state.observer?.unobserve(element);
  state.observedElements.delete(element);
}

function onRowResizeEntries(
  state: ObservationState,
  entries: readonly ResizeObserverEntry[],
): void {
  state.options.getResizeDeferMetrics().resizeObserverCallbackCount +=
    entries.length;
  for (const entry of entries) {
    const el = entry.target;
    if (!(el instanceof HTMLElement) || !el.isConnected) continue;
    const h = entry.contentRect.height;
    const deferKey = measureKeyForElement(el);
    if (deferKey) {
      const slotH =
        state.options.getMeasureRowLastHeightByKey().get(deferKey) ?? null;
      state.options
        .getUnresolvedResizeDeltaByKey()
        .set(deferKey, computeUnresolvedResizeDeltaPx(slotH, h));
    }
    state.options.scheduleVirtualRowMeasure(el, 'resize');
  }
}

function ensureRowResizeObserver(
  state: ObservationState,
): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') return null;
  if (!state.observer) {
    state.observer = new ResizeObserver((entries) =>
      onRowResizeEntries(state, entries),
    );
  }
  return state.observer;
}

function observeVirtualRowElement(
  state: ObservationState,
  element: Element,
): void {
  const ro = ensureRowResizeObserver(state);
  if (!ro || state.observedElements.has(element)) return;
  state.observedElements.add(element);
  ro.observe(element);
}

function disconnectRowResizeObserver(state: ObservationState): void {
  state.observer?.disconnect();
  state.observer = null;
  state.observedElements.clear();
  state.virtualRowElementByKey.clear();
  state.options.clearDeferredResizeKeys();
}

function dropStaleKeysForElement(
  state: ObservationState,
  element: Element,
  measureKey: string,
): void {
  for (const [key, observed] of state.virtualRowElementByKey) {
    if (observed === element && key !== measureKey) {
      state.virtualRowElementByKey.delete(key);
    }
  }
}

function syncVirtualRowResizeObservation(
  state: ObservationState,
  element: Element,
  virtualIndex: number,
): void {
  const measureKey = measureKeyForVirtualIndex(state, virtualIndex);
  if (!measureKey) return;
  element.setAttribute('data-measure-key', measureKey);
  dropStaleKeysForElement(state, element, measureKey);
  const prev = state.virtualRowElementByKey.get(measureKey);
  if (prev && prev !== element) {
    unobserveVirtualRowElement(state, prev);
  }
  state.virtualRowElementByKey.set(measureKey, element);
  observeVirtualRowElement(state, element);
}

function detachVirtualRowResizeObservation(
  state: ObservationState,
  virtualIndex: number,
): void {
  const measureKey = measureKeyForVirtualIndex(state, virtualIndex);
  if (!measureKey) return;
  const prev = state.virtualRowElementByKey.get(measureKey);
  if (!prev) return;
  unobserveVirtualRowElement(state, prev);
  state.virtualRowElementByKey.delete(measureKey);
}

export function useMessageListVirtualRowObservation(
  options: UseMessageListVirtualRowObservationOptions,
) {
  const state: ObservationState = {
    virtualRowElementByKey: new Map(),
    observedElements: new Set(),
    observer: null,
    options,
  };

  return {
    virtualRowElementByKey: state.virtualRowElementByKey,
    disconnectRowResizeObserver: () => disconnectRowResizeObserver(state),
    syncVirtualRowResizeObservation: (element: Element, virtualIndex: number) =>
      syncVirtualRowResizeObservation(state, element, virtualIndex),
    detachVirtualRowResizeObservation: (virtualIndex: number) =>
      detachVirtualRowResizeObservation(state, virtualIndex),
    resolveMeasureRowElement,
    measureKeyForElement,
  };
}
