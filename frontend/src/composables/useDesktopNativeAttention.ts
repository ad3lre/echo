import { storeToRefs } from 'pinia';
import { onScopeDispose, watch } from 'vue';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import {
  isDesktop,
  requestDesktopUserAttention,
  sendDesktopNativeNotificationIfPermitted,
  setDesktopTrayTooltip,
  setDesktopUnreadTaskbarIndicator,
} from '@/platform/desktopBridge';

const NOTIFY_COOLDOWN_MS = 25_000;
const BOOT_QUIET_MS = 4_000;

/**
 * When running in Tauri, mirrors rising attention into OS notifications (background)
 * or taskbar attention (foreground), using {@link useEchoAttentionStore#desktopAttentionScore}.
 */
export function useDesktopNativeAttention(): void {
  if (!isDesktop()) return;

  const attention = useEchoAttentionStore();
  const { desktopAttentionScore } = storeToRefs(attention);
  const notifPrefs = useNotificationPreferencesStore();

  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let lastScore = desktopAttentionScore.value;
  let lastNotifyAt = 0;
  let trayTooltipTimer: ReturnType<typeof setTimeout> | null = null;

  const stopTooltip = watch(
    desktopAttentionScore,
    (next) => {
      if (trayTooltipTimer != null) clearTimeout(trayTooltipTimer);
      trayTooltipTimer = setTimeout(() => {
        trayTooltipTimer = null;
        void setDesktopTrayTooltip(
          next > 0 ? 'Echo — unread activity' : 'Echo',
        );
      }, 400);
    },
    { flush: 'post' },
  );

  const stopTaskbarUnread = watch(
    desktopAttentionScore,
    (next) => {
      void setDesktopUnreadTaskbarIndicator(next > 0);
    },
    { flush: 'post', immediate: true },
  );

  const stop = watch(
    desktopAttentionScore,
    async (next) => {
      const elapsed =
        typeof performance !== 'undefined'
          ? performance.now() - startedAt
          : Date.now() - startedAt;
      if (elapsed < BOOT_QUIET_MS) {
        lastScore = next;
        return;
      }
      if (next <= lastScore) {
        lastScore = next;
        return;
      }
      lastScore = next;
      if (!notifPrefs.settings.desktopAlerts) return;

      if (typeof document === 'undefined') return;
      const hidden = document.visibilityState === 'hidden';
      if (hidden) {
        const now = Date.now();
        if (now - lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
        lastNotifyAt = now;
        await sendDesktopNativeNotificationIfPermitted({
          title: 'Echo',
          body: 'You have new messages or mentions.',
        });
      } else {
        void requestDesktopUserAttention(false);
      }
    },
    { flush: 'post' },
  );

  onScopeDispose(() => {
    stop();
    stopTooltip();
    stopTaskbarUnread();
    if (trayTooltipTimer != null) {
      clearTimeout(trayTooltipTimer);
      trayTooltipTimer = null;
    }
    void setDesktopTrayTooltip('Echo');
    void setDesktopUnreadTaskbarIndicator(false);
  });
}
