/** Minimum auto-dismiss extension after the user clicks the toast body. */
export const APP_TOAST_CLICK_EXTEND_MS = 5000;

/** Auto-dismiss duration while the user drafts a quick reply from the toast. */
export const APP_TOAST_REPLY_EXTEND_MS = 60_000;

export function resolveAppToastClickExtendMs(baseDurationMs: number): number {
  const base = Number.isFinite(baseDurationMs)
    ? Math.max(0, baseDurationMs)
    : 0;
  return Math.max(base, APP_TOAST_CLICK_EXTEND_MS);
}

export function resolveAppToastReplyExtendMs(baseDurationMs: number): number {
  const base = Number.isFinite(baseDurationMs)
    ? Math.max(0, baseDurationMs)
    : 0;
  return Math.max(base * 3, APP_TOAST_REPLY_EXTEND_MS);
}

/** Ignore clicks on controls / editable fields — those have their own behavior. */
export function shouldExtendAppToastOnClick(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest(
    'button, a, input, textarea, select, [contenteditable="true"], [contenteditable=""]',
  );
}
