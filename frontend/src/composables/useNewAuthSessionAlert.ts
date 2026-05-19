import { onMounted, onUnmounted, ref, watch } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { authFetchSessions, type AuthSessionInfo } from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';

const STORAGE_V = 1 as const;

function knownSessionsStorageKey(userId: string): string {
  return `echo_known_auth_sessions_v${STORAGE_V}_${userId}`;
}

function readKnownIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(knownSessionsStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { ids?: unknown };
    if (!Array.isArray(parsed.ids)) return new Set();
    return new Set(
      parsed.ids.filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      ),
    );
  } catch {
    return new Set();
  }
}

function writeKnownIds(userId: string, ids: string[]) {
  try {
    localStorage.setItem(
      knownSessionsStorageKey(userId),
      JSON.stringify({ v: STORAGE_V, ids }),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * When another device signs in, existing browsers detect a new refresh-token row
 * (via periodic / visibility-triggered GET /auth/sessions) and can warn the user.
 */
export function useNewAuthSessionAlert() {
  const authSession = useAuthSessionStore();
  const showModal = ref(false);
  const newSessions = ref<AuthSessionInfo[]>([]);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function checkForNewDevices() {
    if (
      typeof window === 'undefined' ||
      !authSession.isAuthenticated ||
      echoSyncCapabilities.isMockDataMode ||
      authSession.backendUser?.isGuest
    ) {
      return;
    }
    const userId = authSession.backendUser?.id?.trim();
    if (!userId) return;

    try {
      const { sessions } = await authFetchSessions();
      const known = readKnownIds(userId);
      const hasPrior = known.size > 0;
      const currentIds = sessions.map((s) => s.id);
      const fresh = sessions.filter((s) => !known.has(s.id));

      if (hasPrior && fresh.length > 0) {
        const others = fresh.filter((s) => s.isCurrentSession === false);
        if (others.length > 0) {
          newSessions.value = others;
          showModal.value = true;
        }
      }
      writeKnownIds(userId, currentIds);
    } catch {
      /* ignore — offline / 401 handled elsewhere */
    }
  }

  watch(showModal, (v) => {
    if (!v) newSessions.value = [];
  });

  function onVisibility() {
    if (document.visibilityState === 'visible') void checkForNewDevices();
  }

  watch(
    () => [authSession.isAuthenticated, authSession.backendUser?.id] as const,
    ([authed]) => {
      if (!authed) {
        showModal.value = false;
        newSessions.value = [];
        return;
      }
      void checkForNewDevices();
    },
  );

  onMounted(() => {
    void checkForNewDevices();
    document.addEventListener('visibilitychange', onVisibility);
    intervalId = setInterval(() => void checkForNewDevices(), 120_000);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (intervalId != null) clearInterval(intervalId);
  });

  return {
    showNewAuthSessionModal: showModal,
    newAuthSessions: newSessions,
  };
}
