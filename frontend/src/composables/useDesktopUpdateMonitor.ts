import { onScopeDispose } from 'vue';
import { useDesktopUpdateStore } from '@/stores/desktopUpdate';
import { isDesktop, checkDesktopAppUpdate } from '@/platform/desktopBridge';
import { DESKTOP_UPDATE_CHECK_INTERVAL_MS } from '@/config';

/**
 * Optional background update checks for Tauri desktop (silent; surfaces banner when available).
 */
export function useDesktopUpdateMonitor(): void {
  if (!isDesktop()) return;
  const intervalMs = DESKTOP_UPDATE_CHECK_INTERVAL_MS;
  if (!intervalMs || intervalMs < 60_000) return;

  const store = useDesktopUpdateStore();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    try {
      const res = await checkDesktopAppUpdate();
      if (res.status === 'available') {
        store.setPending(res.version);
      }
    } catch {
      /* ignore */
    }
  }

  void tick();
  timer = setInterval(() => void tick(), intervalMs);

  onScopeDispose(() => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  });
}
