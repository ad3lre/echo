// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  ANCHOR_DRIFT_THRESHOLD_PX,
  getAnchorMessageIdFromViewport,
  getMessageElementById,
  getScrollDirection,
  isAnchorDriftBeyondThreshold,
  measureMessageTopInContainer,
  restoreAnchorByPixelDelta,
  restorePrependScroll,
  type PrependSnapshot,
} from './messageListPrependAnchor';

function setRect(
  element: HTMLElement,
  rect: { top: number; bottom: number; left?: number; right?: number },
) {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: rect.top,
      width: 300,
      height: rect.bottom - rect.top,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left ?? 0,
      right: rect.right ?? 300,
      toJSON: () => ({}),
    }) as DOMRect;
}

function setupContainer() {
  const container = document.createElement('div');
  Object.defineProperty(container, 'scrollHeight', {
    configurable: true,
    value: 1200,
  });
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: 400,
  });
  setRect(container, { top: 100, bottom: 500 });
  document.body.appendChild(container);
  return container;
}

describe('messageListPrependAnchor', () => {
  it('finds the latest visible message id in the viewport', () => {
    const container = setupContainer();
    const first = document.createElement('div');
    first.id = 'message-m1';
    setRect(first, { top: 120, bottom: 180 });
    const last = document.createElement('div');
    last.id = 'message-m2';
    setRect(last, { top: 390, bottom: 470 });
    container.append(first, last);

    const map = new Map([
      ['m1', { id: 'm1' }],
      ['m2', { id: 'm2' }],
    ]);
    expect(
      getAnchorMessageIdFromViewport(
        container,
        [{ index: 0 }, { index: 1 }],
        ['m1', 'm2'],
        map,
      ),
    ).toEqual({
      anchorMessageId: 'm2',
    });
  });

  it('falls back to the latest message id when DOM measurement is unavailable', () => {
    const container = setupContainer();
    const map = new Map([
      ['m1', { id: 'm1' }],
      ['m2', { id: 'm2' }],
    ]);
    expect(
      getAnchorMessageIdFromViewport(
        container,
        [{ index: 0 }],
        ['m1', 'm2'],
        map,
      ),
    ).toEqual({
      anchorMessageId: 'm2',
    });
  });

  it('measures message top relative to the scroll container', () => {
    const container = setupContainer();
    const row = document.createElement('div');
    row.id = 'message-m1';
    setRect(row, { top: 148, bottom: 220 });
    container.append(row);

    expect(getMessageElementById(container, 'm1')).toBe(row);
    expect(measureMessageTopInContainer(container, 'm1')).toBe(48);
  });

  it('restorePrependScroll applies scrollHeight delta then snaps anchor offset', () => {
    const container = setupContainer();
    container.scrollTop = 220;
    const row = document.createElement('div');
    row.id = 'message-m1';
    setRect(row, { top: 160, bottom: 220 });
    container.append(row);

    const snapshot: PrependSnapshot = {
      channelId: 'c1',
      txId: 1,
      anchorMessageId: 'm1',
      anchorTopBefore: 40,
      scrollTopBefore: 220,
      scrollHeightBefore: 1000,
    };

    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 1200,
    });
    // After scrollTop += heightDelta, layout keeps the anchor at the preserved offset.
    setRect(row, { top: 140, bottom: 200 });

    const result = restorePrependScroll(container, snapshot);
    expect(result.heightDeltaApplied).toBe(200);
    expect(container.scrollTop).toBe(420);
    expect(measureMessageTopInContainer(container, 'm1')).toBe(40);
    expect(result.anchorSnapDeltaApplied).toBe(0);
    expect(result.anchorSnapPassesUsed).toBe(0);
  });

  it('restorePrependScroll applies anchor snap when height delta leaves residual drift', () => {
    const container = setupContainer();
    container.scrollTop = 220;
    const row = document.createElement('div');
    row.id = 'message-m1';
    setRect(row, { top: 160, bottom: 220 });
    container.append(row);

    const snapshot: PrependSnapshot = {
      channelId: 'c1',
      txId: 3,
      anchorMessageId: 'm1',
      anchorTopBefore: 40,
      scrollTopBefore: 220,
      scrollHeightBefore: 1000,
    };

    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 1200,
    });
    setRect(row, { top: 150, bottom: 210 });

    const result = restorePrependScroll(container, snapshot);
    expect(result.heightDeltaApplied).toBe(200);
    /** Fixed mock rects do not “settle” after scroll — second snap runs until pass cap. */
    expect(result.anchorSnapPassesUsed).toBe(2);
    expect(result.anchorSnapDeltaApplied).toBe(20);
    expect(container.scrollTop).toBe(440);
  });

  it('restores the anchor by applying the top delta to scrollTop (deprecated helper)', () => {
    const container = setupContainer();
    container.scrollTop = 220;
    const row = document.createElement('div');
    row.id = 'message-m1';
    setRect(row, { top: 160, bottom: 220 });
    container.append(row);

    const snapshot: PrependSnapshot = {
      channelId: 'c1',
      txId: 1,
      anchorMessageId: 'm1',
      anchorTopBefore: 40,
      scrollTopBefore: 220,
      scrollHeightBefore: 1000,
    };

    expect(restoreAnchorByPixelDelta(container, snapshot)).toBe(20);
    expect(container.scrollTop).toBe(240);
  });

  it('detects drift beyond the threshold', () => {
    const container = setupContainer();
    const row = document.createElement('div');
    row.id = 'message-m1';
    setRect(row, {
      top: 100 + ANCHOR_DRIFT_THRESHOLD_PX + 5,
      bottom: 180 + ANCHOR_DRIFT_THRESHOLD_PX + 5,
    });
    container.append(row);

    const snapshot: PrependSnapshot = {
      channelId: 'c1',
      txId: 2,
      anchorMessageId: 'm1',
      anchorTopBefore: 0,
      scrollTopBefore: 0,
      scrollHeightBefore: 1000,
    };

    expect(isAnchorDriftBeyondThreshold(container, snapshot)).toBe(true);
  });

  it('reports scroll direction for reverse-scroll guard logic', () => {
    expect(getScrollDirection(120, 80)).toBe('up');
    expect(getScrollDirection(80, 120)).toBe('down');
    expect(getScrollDirection(80, 80)).toBe('still');
  });
});
