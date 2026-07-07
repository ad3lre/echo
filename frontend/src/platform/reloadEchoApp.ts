import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '@/platform/desktopBridge';

/** Hard reload the SPA — native WebView reload on Tauri desktop; `location.reload` on web. */
export function reloadEchoApp(): void {
  if (typeof window === 'undefined') return;
  if (isDesktop()) {
    void invoke('desktop_shell_hard_reload').catch((error: unknown) => {
      console.warn(
        '[echo-desktop] native hard reload failed; falling back to location.reload',
        error,
      );
      window.location.reload();
    });
    return;
  }
  window.location.reload();
}
