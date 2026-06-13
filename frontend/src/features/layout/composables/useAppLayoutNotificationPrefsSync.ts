import { watch } from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { useChannelNotificationOverridesStore } from '@/stores/channelNotificationOverrides';
import {
  disableEchoWebPushSubscription,
  ensureEchoWebPushSubscription,
} from '@/services/webPush';

export function useAppLayoutNotificationPrefsSync(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
}): void {
  const notificationPreferences = useNotificationPreferencesStore();
  let cloudSyncConfigured = false;

  watch(
    () => deps.authSession.accessToken,
    () => {
      const token = deps.authSession.accessToken?.trim() ?? '';
      if (!token) {
        cloudSyncConfigured = false;
        notificationPreferences.disableCloudSync();
        return;
      }
      if (cloudSyncConfigured) return;
      cloudSyncConfigured = true;
      void notificationPreferences.configureCloudSync(
        () => deps.authSession.accessToken?.trim() ?? '',
      );
    },
    { immediate: true },
  );

  watch(
    [
      () => deps.authSession.accessToken,
      () => notificationPreferences.settings.desktopAlerts,
    ],
    () => {
      const token = deps.authSession.accessToken?.trim() ?? '';
      if (!token) return;
      if (notificationPreferences.settings.desktopAlerts) {
        void ensureEchoWebPushSubscription(token);
      } else {
        void disableEchoWebPushSubscription(token);
      }
    },
    { immediate: true },
  );

  const channelNotificationOverrides = useChannelNotificationOverridesStore();
  watch(
    () => deps.authSession.accessToken,
    () => {
      const token = deps.authSession.accessToken?.trim() ?? '';
      if (!token) {
        channelNotificationOverrides.reset();
        return;
      }
      if (!channelNotificationOverrides.loaded) {
        void channelNotificationOverrides.refresh(token);
      }
    },
    { immediate: true },
  );
}
