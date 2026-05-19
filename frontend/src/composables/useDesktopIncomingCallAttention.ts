import type { Ref } from 'vue';
import { onScopeDispose, watch } from 'vue';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import {
  isDesktop,
  requestDesktopUserAttention,
  sendDesktopNativeNotificationIfPermitted,
} from '@/platform/desktopBridge';

/**
 * When a DM / overlay ring is active and the document is hidden, nudge the OS once per ring session.
 */
export function useDesktopIncomingCallAttention(ringUi: Ref<boolean>): void {
  if (!isDesktop()) return;

  const prefs = useNotificationPreferencesStore();
  let notifiedForSession = false;

  const stopRing = watch(
    ringUi,
    async (on) => {
      if (!on) {
        notifiedForSession = false;
        return;
      }
      if (!prefs.settings.desktopAlerts) return;
      if (notifiedForSession) return;
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'hidden') return;

      notifiedForSession = true;
      await sendDesktopNativeNotificationIfPermitted({
        title: 'Echo',
        body: 'Incoming call',
      });
      void requestDesktopUserAttention(true);
    },
    { flush: 'post' },
  );

  const stopPrefs = watch(
    () => prefs.settings.desktopAlerts,
    () => {
      if (!prefs.settings.desktopAlerts) notifiedForSession = false;
    },
  );

  onScopeDispose(() => {
    stopRing();
    stopPrefs();
  });
}
