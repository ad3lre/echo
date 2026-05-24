import { echoT } from '@/i18n';
import { isDesktop } from '@/platform/desktopBridge';

export async function syncDesktopTrayLocale(): Promise<void> {
  try {
    if (!isDesktop()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('desktop_shell_set_tray_menu_labels', {
      labels: {
        show: echoT('tauri.showEcho'),
        openMessages: echoT('tauri.openMessages'),
        toggleDesktopAlerts: echoT('tauri.toggleDesktopAlerts'),
        notificationSettings: echoT('tauri.notificationSettings'),
        quit: echoT('tauri.quitEcho'),
        tooltip: echoT('tauri.trayTooltip'),
      },
    });
  } catch {
    /* not in tauri runtime or tray not ready */
  }
}
