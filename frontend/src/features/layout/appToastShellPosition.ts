/** Minimum breathing room between the toast shell and the layout viewport bottom. */
export const APP_TOAST_VIEWPORT_FLOOR = '1.25rem';

export const APP_TOAST_SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

/** Gap between the measured chat bottom stack and the toast shell. */
export const APP_TOAST_CHROME_GAP_PX = 12;

export type AppToastBottomInsetOptions = {
  elevated: boolean;
  measuredChromeInsetPx: number;
};

export function appToastBottomInsetCss(
  options: AppToastBottomInsetOptions,
): string {
  const safe = APP_TOAST_SAFE_BOTTOM;
  const floor = APP_TOAST_VIEWPORT_FLOOR;
  if (!options.elevated) {
    return `max(1.5rem, calc(${safe} + ${floor}))`;
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
 * Bottom-anchored toast with `max-height` derived from the same inset values so the shell
 * cannot extend past the viewport (the old `min(90dvh, …)` cap could exceed `bottom + height`).
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
      ? `max(0.75rem, env(safe-area-inset-top, 0px), ${input.visualViewportOffsetTopPx}px)`
      : `max(0.75rem, env(safe-area-inset-top, 0px))`;
  const maxHeight = `max(0px, calc(100dvh - (${bottom}) - (${topReserve}) - 0.5rem))`;
  return { bottom, maxHeight };
}
