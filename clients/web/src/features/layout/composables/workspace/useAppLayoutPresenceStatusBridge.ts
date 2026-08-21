import { computed, type ComputedRef, type Ref } from 'vue';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { useEchoAfkPresence } from '@/features/layout/composables/realtime/useEchoAfkPresence';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  normalizeCanonicalPresenceStatus,
  selectSelfPresence,
} from '@/features/layout/presence';

export function useAppLayoutPresenceStatusBridge(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  presenceByUserId: Ref<Record<string, string>>;
  presenceMobileByUserId: Ref<Record<string, boolean>>;
  updateCurrentUserStatus: (
    status: 'online' | 'idle' | 'do_not_disturb' | 'offline',
  ) => void;
}): { updateStatusCast: (status: string) => void } {
  const afkPresenceEnabled = computed(
    () =>
      deps.authSession.isAuthenticated &&
      !echoSyncCapabilities.isMockDataMode &&
      !!deps.authSession.backendUser?.id,
  );

  const { noteUserPresenceChoice } = useEchoAfkPresence({
    enabled: afkPresenceEnabled,
    getStatus: () => {
      const uid = deps.authSession.backendUser?.id?.trim();
      if (!uid) return undefined;
      return selectSelfPresence({
        userId: uid,
        authoritativeStatusesByUserId: deps.presenceByUserId.value,
        sessionStatus: deps.authSession.backendUser?.status,
        mobileSurface: deps.presenceMobileByUserId.value[uid] === true,
      }).status;
    },
    setStatus: deps.updateCurrentUserStatus,
  });

  const updateStatusCast = (status: string) => {
    const canonical = normalizeCanonicalPresenceStatus(status);
    if (!canonical) return;
    noteUserPresenceChoice(canonical);
    deps.updateCurrentUserStatus(canonical);
  };

  return { updateStatusCast };
}
