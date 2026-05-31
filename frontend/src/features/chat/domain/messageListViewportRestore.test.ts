// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import {
  applyViewportAnchorPixelDelta,
  restoreViewportAnchorInContainer,
} from './messageListViewportRestore';

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
    value: 2000,
  });
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: 400,
  });
  setRect(container, { top: 100, bottom: 500 });
  document.body.appendChild(container);
  return container;
}

describe('messageListViewportRestore', () => {
  it('applies pixel delta to match saved anchor offset', () => {
    const container = setupContainer();
    const row = document.createElement('div');
    row.id = 'message-m1';
    setRect(row, { top: 160, bottom: 220 });
    container.append(row);
    container.scrollTop = 80;

    const ok = applyViewportAnchorPixelDelta(container, {
      anchorMessageId: 'm1',
      anchorTop: 40,
    });
    expect(container.scrollTop).toBe(100);
    expect(ok).toBe(true);
  });

  it('scrolls virtualizer to anchor index before pixel snap', () => {
    const container = setupContainer();
    const row = document.createElement('div');
    row.id = 'message-m3';
    setRect(row, { top: 400, bottom: 460 });
    container.append(row);
    container.scrollTop = 0;

    const scrollToIndex = vi.fn();
    restoreViewportAnchorInContainer(
      container,
      ['m1', 'm2', 'm3'],
      { scrollToIndex },
      { anchorMessageId: 'm3', anchorTop: 24 },
    );

    expect(scrollToIndex).toHaveBeenCalledWith(2, {
      align: 'start',
      behavior: 'auto',
    });
  });
});
