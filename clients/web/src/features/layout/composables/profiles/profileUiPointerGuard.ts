/**
 * Profile popouts/panels dismiss under the pointer during the same click that
 * opens a deeper profile surface. The retargeted click can hit the chat avatar
 * or DM header and toggle the overview closed. Defer dismiss + briefly suppress
 * profile open handlers (same idea as `deferDialogDispatch` in appDialogs.ts).
 */

let suppressProfileUiInteractionUntil = 0;

export function suppressProfileUiInteraction(ms = 400): void {
  suppressProfileUiInteractionUntil = Date.now() + ms;
}

/** Returns true once per suppression window (consumes the flag). */
export function consumeProfileUiInteractionSuppressed(): boolean {
  if (Date.now() >= suppressProfileUiInteractionUntil) return false;
  suppressProfileUiInteractionUntil = 0;
  return true;
}

export function deferAfterProfilePointerAction(action: () => void): void {
  if (typeof window === 'undefined') {
    action();
    return;
  }
  suppressProfileUiInteraction();
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(action);
    });
  });
}
