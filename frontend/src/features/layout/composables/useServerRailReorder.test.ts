// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useServerRailReorder } from './useServerRailReorder';

function mockSlotRects(
  folder: HTMLElement,
  rects: Array<{ top: number; bottom: number; left: number; right: number }>,
) {
  const slots = folder.querySelectorAll('.server-folder__slot');
  rects.forEach((r, i) => {
    const el = slots[i];
    if (!el) return;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      ...r,
      width: r.right - r.left,
      height: r.bottom - r.top,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    } as DOMRect);
  });
}

function pointerDownOn(
  target: HTMLElement,
  init: PointerEventInit,
): PointerEvent {
  const e = new PointerEvent('pointerdown', { bubbles: true, ...init });
  Object.defineProperty(e, 'currentTarget', {
    value: target,
    enumerable: true,
  });
  return e;
}

describe('useServerRailReorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('commits reorder after hold-activate and pointerup', async () => {
    document.body.innerHTML = `
      <div class="servers-folder">
        <div class="server-folder__slot"><button type="button" id="b0"></button></div>
        <div class="server-folder__slot"><button type="button" id="b1"></button></div>
      </div>`;
    const folder = document.querySelector('.servers-folder') as HTMLElement;
    const b0 = document.getElementById('b0') as HTMLButtonElement;
    mockSlotRects(folder, [
      { top: 0, bottom: 40, left: 0, right: 40 },
      { top: 60, bottom: 100, left: 0, right: 40 },
    ]);

    const reorder = vi.fn();
    const r = useServerRailReorder(
      ref(true),
      ref(2),
      reorder,
      ref('vertical'),
      ref(false),
    );

    r.onRailServerPointerDown({
      event: pointerDownOn(b0, {
        pointerId: 7,
        pointerType: 'mouse',
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
      index: 0,
      folderRoot: folder,
    });

    vi.advanceTimersByTime(210);
    await nextTick();

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 7,
        clientX: 10,
        clientY: 85,
      }),
    );
    await nextTick();

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 7,
        clientX: 10,
        clientY: 85,
      }),
    );
    await nextTick();

    expect(reorder).toHaveBeenCalledWith(0, 1);
    expect(r.consumeRailSelectIntent()).toBe(false);
    expect(r.consumeRailSelectIntent()).toBe(true);
  });

  it('allows server select after small pointer jitter without reorder', async () => {
    document.body.innerHTML = `
      <div class="servers-folder">
        <div class="server-folder__slot"><button type="button" id="b0"></button></div>
        <div class="server-folder__slot"><button type="button" id="b1"></button></div>
      </div>`;
    const folder = document.querySelector('.servers-folder') as HTMLElement;
    const b0 = document.getElementById('b0') as HTMLButtonElement;
    mockSlotRects(folder, [
      { top: 0, bottom: 40, left: 0, right: 40 },
      { top: 60, bottom: 100, left: 0, right: 40 },
    ]);

    const reorder = vi.fn();
    const r = useServerRailReorder(
      ref(true),
      ref(2),
      reorder,
      ref('vertical'),
      ref(false),
    );

    r.onRailServerPointerDown({
      event: pointerDownOn(b0, {
        pointerId: 8,
        pointerType: 'mouse',
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
      index: 0,
      folderRoot: folder,
    });

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 8,
        clientX: 22,
        clientY: 12,
      }),
    );
    await nextTick();

    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 8,
        clientX: 22,
        clientY: 12,
      }),
    );
    await nextTick();

    expect(reorder).not.toHaveBeenCalled();
    expect(r.consumeRailSelectIntent()).toBe(true);
  });
});
