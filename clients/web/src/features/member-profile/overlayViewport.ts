/**
 * Metrics for positioning `position: fixed` overlays (popouts, menus) so they stay
 * inside the **visible** viewport under browser zoom, OS scaling, and visualViewport pan.
 */
export type OverlayVisibleViewport = {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
};

const FALLBACK: OverlayVisibleViewport = {
  offsetLeft: 0,
  offsetTop: 0,
  width: 1440,
  height: 900,
};

export function readOverlayVisibleViewport(): OverlayVisibleViewport {
  if (typeof window === 'undefined') return { ...FALLBACK };
  const vv = window.visualViewport;
  if (vv) {
    return {
      offsetLeft: Math.max(0, Math.round(vv.offsetLeft)),
      offsetTop: Math.max(0, Math.round(vv.offsetTop)),
      width: Math.max(0, Math.round(vv.width)),
      height: Math.max(0, Math.round(vv.height)),
    };
  }
  return {
    offsetLeft: 0,
    offsetTop: 0,
    width: Math.max(0, Math.round(window.innerWidth)),
    height: Math.max(0, Math.round(window.innerHeight)),
  };
}

/** Clamp a fixed overlay box fully inside the visible viewport strip (layout coordinates). */
export function clampFixedOverlayBox(
  left: number,
  top: number,
  width: number,
  height: number,
  viewport: OverlayVisibleViewport,
  padding: number,
): { left: number; top: number } {
  const minLeft = viewport.offsetLeft + padding;
  const maxLeft = viewport.offsetLeft + viewport.width - width - padding;
  const minTop = viewport.offsetTop + padding;
  const maxTop = viewport.offsetTop + viewport.height - height - padding;
  return {
    left: Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft)),
    top: Math.min(Math.max(top, minTop), Math.max(minTop, maxTop)),
  };
}
