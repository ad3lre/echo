import { dispatchAppToast } from '@/utils/controllerMissingAction';

let lastStorageFailureToastAt = 0;
const STORAGE_FAILURE_TOAST_COOLDOWN_MS = 5000;

/**
 * Best-effort `localStorage.setItem` with a deduped user-visible warning on failure
 * (Safari iOS/iPad private mode, ITP quirks, quota, etc.).
 */
export function tryLocalStorageSetItem(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    const now = Date.now();
    if (now - lastStorageFailureToastAt >= STORAGE_FAILURE_TOAST_COOLDOWN_MS) {
      lastStorageFailureToastAt = now;
      dispatchAppToast(
        'Could not save this setting. If you are in Private browsing or storage is restricted, try a normal window or allow site data for Echo.',
        'warning',
      );
    }
    return false;
  }
}
