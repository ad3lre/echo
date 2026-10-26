export type SearchDropdownPosition = {
  top: number;
  left: number;
  width: string;
  height: string;
  maxHeight: string;
};

export type SearchDropdownLayoutInput = {
  inputRect: DOMRect;
  panelRect: DOMRect | null | undefined;
  /** When set, skip reserved-right / left-inset adjustments. */
  anchoredToPanel: boolean;
  gapPx: number;
  horizontalPadPx: number;
  reservedRightPx: number;
  viewportWidth: number;
  bottomPadPx: number;
  /** Tall results panel vs content-hugging filter menus. */
  fillViewportHeight: boolean;
};

/**
 * Compute fixed dropdown geometry for the chat search composite.
 * Results fill remaining viewport height; filter menus use maxHeight only.
 */
export function computeSearchDropdownPosition(
  input: SearchDropdownLayoutInput,
): SearchDropdownPosition {
  const top = input.inputRect.bottom + input.gapPx;
  let left = input.panelRect
    ? input.panelRect.left
    : input.inputRect.left - input.horizontalPadPx;
  let widthPx = input.panelRect
    ? input.panelRect.width
    : input.inputRect.width + input.horizontalPadPx * 2;

  if (!input.anchoredToPanel) {
    const maxRight = input.viewportWidth - input.reservedRightPx;
    if (left + widthPx > maxRight) {
      widthPx = Math.max(260, maxRight - left);
    }
    // Pull the left edge in ~10% so the panel doesn’t hug the channel list.
    const leftInset = Math.round(widthPx * 0.1);
    if (leftInset > 0 && widthPx - leftInset >= 260) {
      left += leftInset;
      widthPx -= leftInset;
    }
  }

  const viewportRoom = `calc(100dvh - ${top}px - max(${input.bottomPadPx}px, env(safe-area-inset-bottom, 0px)))`;
  if (input.fillViewportHeight) {
    return {
      top,
      left,
      width: `${widthPx}px`,
      height: viewportRoom,
      maxHeight: '',
    };
  }
  return {
    top,
    left,
    width: `${widthPx}px`,
    height: '',
    maxHeight: viewportRoom,
  };
}
