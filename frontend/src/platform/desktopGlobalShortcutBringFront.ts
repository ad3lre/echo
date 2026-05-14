import { onScopeDispose } from 'vue';
import {
  bringMainWindowToForeground,
  isDesktop,
} from '@/platform/desktopBridge';

const ENABLED_KEY = 'echo.desktop.shortcut.bringFront';
const ACCEL_KEY = 'echo.desktop.shortcut.bringFrontAccel';
const DEFAULT_ACCEL = 'CommandOrControl+Shift+E';

/** Tauri globalShortcut accelerator: modifiers and key segments joined by `+`. */
const ACCEL_PATTERN = /^(?=.*\+)[A-Za-z0-9+]{3,80}$/;

function sanitizeAccelerator(raw: string): string {
  const s = raw.trim();
  if (ACCEL_PATTERN.test(s)) return s;
  console.warn(
    '[echo-desktop] invalid accelerator in localStorage; using default',
    { rawPreview: s.slice(0, 40) },
  );
  return DEFAULT_ACCEL;
}

let appliedAccel: string | null = null;

/**
 * (Re)registers the global “bring Echo to front” shortcut from localStorage.
 * Call after toggling the option in Settings → Desktop.
 */
export async function applyDesktopBringFrontShortcut(): Promise<void> {
  if (!isDesktop()) return;
  const mod = await import('@tauri-apps/plugin-global-shortcut');
  if (appliedAccel) {
    try {
      await mod.unregister(appliedAccel);
    } catch {
      /* ignore */
    }
    appliedAccel = null;
  }
  try {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(ENABLED_KEY) === '0'
    ) {
      return;
    }
  } catch {
    /* ignore */
  }
  const rawAccel =
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem(ACCEL_KEY)?.trim() ?? '')
      : '';
  const accel = rawAccel ? sanitizeAccelerator(rawAccel) : DEFAULT_ACCEL;
  try {
    await mod.register(accel, () => {
      void bringMainWindowToForeground();
    });
    appliedAccel = accel;
  } catch (e) {
    console.warn('[echo-desktop] global shortcut register failed', e);
  }
}

/** Registers on mount; unregisters on teardown. */
export function useDesktopGlobalShortcutBringFront(): void {
  if (!isDesktop()) return;

  void applyDesktopBringFrontShortcut();

  function onStorage(ev: StorageEvent) {
    if (ev.key === ENABLED_KEY || ev.key === ACCEL_KEY) {
      void applyDesktopBringFrontShortcut();
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  onScopeDispose(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
    void (async () => {
      if (!appliedAccel) return;
      try {
        const mod = await import('@tauri-apps/plugin-global-shortcut');
        await mod.unregister(appliedAccel);
      } catch {
        /* ignore */
      }
      appliedAccel = null;
    })();
  });
}
