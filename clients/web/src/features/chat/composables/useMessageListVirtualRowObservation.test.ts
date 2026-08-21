// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResizeDeferMetrics } from '@/features/chat/domain/messageListResizeDefer';
import {
  measureKeyForElement,
  resolveMeasureRowElement,
  useMessageListVirtualRowObservation,
} from './useMessageListVirtualRowObservation';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
  }

  emit(element: HTMLElement, height: number): void {
    this.callback(
      [
        {
          target: element,
          contentRect: { height } as DOMRectReadOnly,
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
}

describe('useMessageListVirtualRowObservation', () => {
  afterEach(() => {
    FakeResizeObserver.instances = [];
    vi.unstubAllGlobals();
  });

  function mountObservation(channelId = 'c1') {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const schedule = vi.fn();
    const metrics = createResizeDeferMetrics();
    const unresolved = new Map<string, number>();
    const lastHeight = new Map<string, number>();
    const clearDeferred = vi.fn();
    const ids = ['m1', 'm2'];
    const api = useMessageListVirtualRowObservation({
      getChannelId: () => channelId,
      messageIdForVirtualIndex: (index) => ids[index] ?? null,
      scheduleVirtualRowMeasure: schedule,
      getResizeDeferMetrics: () => metrics,
      getUnresolvedResizeDeltaByKey: () => unresolved,
      getMeasureRowLastHeightByKey: () => lastHeight,
      clearDeferredResizeKeys: clearDeferred,
    });
    return { api, schedule, metrics, unresolved, lastHeight, clearDeferred };
  }

  it('syncs measure keys and observes the row element', () => {
    const { api } = mountObservation();
    const el = document.createElement('div');
    document.body.appendChild(el);
    api.syncVirtualRowResizeObservation(el, 0);
    expect(el.getAttribute('data-measure-key')).toBe('c1:m1');
    expect(api.virtualRowElementByKey.get('c1:m1')).toBe(el);
    expect(FakeResizeObserver.instances[0]?.observed.has(el)).toBe(true);
  });

  it('schedules a resize measure from the observer callback', () => {
    const { api, schedule, metrics, lastHeight, unresolved } =
      mountObservation();
    const el = document.createElement('div');
    document.body.appendChild(el);
    lastHeight.set('c1:m1', 80);
    api.syncVirtualRowResizeObservation(el, 0);
    FakeResizeObserver.instances[0]?.emit(el, 130);
    expect(metrics.resizeObserverCallbackCount).toBe(1);
    expect(unresolved.get('c1:m1')).toBe(50);
    expect(schedule).toHaveBeenCalledWith(el, 'resize');
  });

  it('detaches and disconnects observed rows', () => {
    const { api, clearDeferred } = mountObservation();
    const el = document.createElement('div');
    document.body.appendChild(el);
    api.syncVirtualRowResizeObservation(el, 0);
    api.detachVirtualRowResizeObservation(0);
    expect(api.virtualRowElementByKey.has('c1:m1')).toBe(false);
    expect(FakeResizeObserver.instances[0]?.observed.has(el)).toBe(false);
    api.syncVirtualRowResizeObservation(el, 0);
    api.disconnectRowResizeObserver();
    expect(api.virtualRowElementByKey.size).toBe(0);
    expect(clearDeferred).toHaveBeenCalled();
  });

  it('resolves Vue instance $el and measure-key attributes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-measure-key', ' c1:m9 ');
    expect(measureKeyForElement(el)).toBe('c1:m9');
    expect(resolveMeasureRowElement({ $el: el } as never)).toBe(el);
    expect(resolveMeasureRowElement(null)).toBeNull();
  });
});
