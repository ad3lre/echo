/** Minimum breathing room between the toast shell and the layout viewport bottom. */
export const APP_TOAST_VIEWPORT_FLOOR = '1rem';

export const APP_TOAST_SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

/** Minimum distance from the layout viewport bottom when not clearing chrome. */
export const APP_TOAST_VIEWPORT_BOTTOM_MIN = '1.25rem';

/** Top breathing room for the toast viewport (safe-area is layered via max()). */
export const APP_TOAST_TOP_RESERVE = '0.5rem';

/** Gap between the measured chat bottom stack and the toast shell. */
export const APP_TOAST_CHROME_GAP_PX = 10;

export type AppToastBottomInsetOptions = {
  elevated: boolean;
  measuredChromeInsetPx: number;
};

export type AppToastClearsBottomChromeInput = {
  chatComposerFocused: boolean;
  measuredChromeInsetPx: number;
  useCompactTriPaneShell: boolean;
  useCompactDmShell: boolean;
  hasGuildChannelChrome: boolean;
  isDmThreadSurface: boolean;
};

/** Whether the toast should lift above the chat composer / bottom chrome stack. */
export function shouldAppToastClearBottomChrome(
  input: AppToastClearsBottomChromeInput,
): boolean {
  if (input.chatComposerFocused) return true;
  if (input.measuredChromeInsetPx > 0) return true;
  if (input.useCompactTriPaneShell) return true;
  if (input.useCompactDmShell) return true;
  if (input.hasGuildChannelChrome) return true;
  return input.isDmThreadSurface;
}

export function appToastBottomInsetCss(
  options: AppToastBottomInsetOptions,
): string {
  const safe = APP_TOAST_SAFE_BOTTOM;
  const floor = APP_TOAST_VIEWPORT_FLOOR;
  if (!options.elevated) {
    return `max(${APP_TOAST_VIEWPORT_BOTTOM_MIN}, calc(${safe} + ${floor}))`;
  }
  const measured = options.measuredChromeInsetPx;
  if (measured > 0) {
    return `calc(${measured + APP_TOAST_CHROME_GAP_PX}px + ${safe} + ${floor})`;
  }
  return `max(8rem, calc(${safe} + 6rem + ${floor}))`;
}

export type VisualViewportToastInsets = {
  /** Layout viewport space below the visual viewport (iOS keyboard / chrome). */
  bottomExtraPx: number;
  /** Visual viewport top offset in layout coordinates. */
  offsetTopPx: number;
};

/**
 * Derive toast lift from `visualViewport` metrics. Caps runaway gaps from buggy WebViews
 * while still lifting the toast above keyboard / home-indicator dead bands.
 */
export function computeVisualViewportToastInsets(
  innerHeight: number,
  visualViewport:
    | Pick<VisualViewport, 'height' | 'offsetTop'>
    | null
    | undefined,
): VisualViewportToastInsets {
  if (!visualViewport || innerHeight <= 0) {
    return { bottomExtraPx: 0, offsetTopPx: 0 };
  }
  const gap = innerHeight - visualViewport.offsetTop - visualViewport.height;
  const raw = Math.max(0, Math.round(gap));
  const cap = Math.min(Math.round(innerHeight * 0.55), 520);
  return {
    bottomExtraPx: Math.min(raw, cap),
    offsetTopPx: Math.max(0, Math.round(visualViewport.offsetTop)),
  };
}

export type AppToastShellPositionInput = {
  bottomInsetCss: string;
  bottomExtraPx: number;
  visualViewportOffsetTopPx: number;
};

/**
 * Build viewport bounds for the toast container.
 *
 * The toast viewport is pinned by both `top` and `bottom` so the browser, not custom
 * geometry math, guarantees in-viewport placement. `max-height` mirrors the same bounds
 * for older WebViews that are conservative with fixed insets + overflow containers.
 */
export function buildAppToastShellPositionStyle(
  input: AppToastShellPositionInput,
): Record<string, string> {
  const bottom =
    input.bottomExtraPx > 0
      ? `calc(${input.bottomInsetCss} + ${input.bottomExtraPx}px)`
      : input.bottomInsetCss;
  const topReserve =
    input.visualViewportOffsetTopPx > 0
      ? `max(${APP_TOAST_TOP_RESERVE}, env(safe-area-inset-top, 0px), ${input.visualViewportOffsetTopPx}px)`
      : `max(${APP_TOAST_TOP_RESERVE}, env(safe-area-inset-top, 0px))`;
  const maxHeight = `max(0px, calc(min(100dvh, 100vh) - (${bottom}) - (${topReserve})))`;
  return { top: topReserve, bottom, maxHeight };
}
