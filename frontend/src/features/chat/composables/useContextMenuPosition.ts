import { ref } from 'vue';

/** Fallback size before the menu is measured (server rail menu uses min-w ~220px). */
const MENU_WIDTH_EST = 240;
const MENU_HEIGHT_EST = 280;

export const VIEWPORT_PAD = 8;

/**
 * Clamp a fixed-position box (top-left at left, top) so it stays inside the viewport.
 */
export function clampMenuToViewport(
  left: number,
  top: number,
  width: number,
  height: number,
  pad = VIEWPORT_PAD,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let l = left;
  let t = top;
  if (l < pad) l = pad;
  if (l + width > vw - pad) l = Math.max(pad, vw - width - pad);
  if (t < pad) t = pad;
  if (t + height > vh - pad) t = Math.max(pad, vh - height - pad);
  return { left: l, top: t };
}

export function useContextMenuPosition() {
  const menuPosition = ref({ left: 0, top: 0 });

  function setMenuPositionFromRect(rect: DOMRect) {
    const pad = VIEWPORT_PAD;
    const estW = MENU_WIDTH_EST;
    const estH = MENU_HEIGHT_EST;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + estW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - estW - pad);
    }
    if (left < pad) left = pad;
    if (top + estH > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - estH - 4);
    }
    menuPosition.value = clampMenuToViewport(left, top, estW, estH);
  }

  function setMenuPositionFromPoint(clientX: number, clientY: number) {
    const pad = VIEWPORT_PAD;
    const estW = MENU_WIDTH_EST;
    const estH = MENU_HEIGHT_EST;
    const left = clientX;
    let top = clientY + 4;
    if (top + estH > window.innerHeight - pad) {
      top = Math.max(pad, clientY - estH - 4);
    }
    menuPosition.value = clampMenuToViewport(left, top, estW, estH);
  }

  /** After the menu is in the DOM, snap its top-left using its real width/height. */
  function fitMenuToViewport(menuEl: HTMLElement | null) {
    if (!menuEl) return;
    const r = menuEl.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    if (w < 1 && h < 1) return;
    menuPosition.value = clampMenuToViewport(r.left, r.top, w, h);
  }

  return {
    menuPosition,
    setMenuPositionFromRect,
    setMenuPositionFromPoint,
    fitMenuToViewport,
    clampMenuToViewport,
  };
}
