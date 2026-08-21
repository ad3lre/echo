import { ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  AuthApiError,
  authFetchSessions,
  authRevokeSession,
  type AuthSessionInfo,
} from '@/api/authClient';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { formatIsoDateTimeLocal } from '@/features/chat/formatTimestamp';

export function useSessionManager() {
  const authSession = useAuthSessionStore();

  const sessions = ref<AuthSessionInfo[]>([]);
  const sessionsLoading = ref(false);
  const sessionsError = ref<string | null>(null);
  const sessionsRevokingId = ref<string | null>(null);

  async function loadAccountSessions() {
    sessionsError.value = null;
    if (
      !authSession.isAuthenticated ||
      echoSyncCapabilities.isMockDataMode ||
      authSession.backendUser?.isGuest
    ) {
      sessions.value = [];
      return;
    }
    sessionsLoading.value = true;
    try {
      const { sessions: list } = await authFetchSessions();
      sessions.value = list;
    } catch (e) {
      sessionsError.value =
        e instanceof AuthApiError ? e.message : 'Could not load sessions.';
      sessions.value = [];
    } finally {
      sessionsLoading.value = false;
    }
  }

  async function revokeSession(sessionId: string) {
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    sessionsRevokingId.value = sessionId;
    sessionsError.value = null;
    try {
      await authRevokeSession(sessionId);
      await loadAccountSessions();
    } catch (e) {
      sessionsError.value =
        e instanceof AuthApiError ? e.message : 'Could not revoke session.';
    } finally {
      sessionsRevokingId.value = null;
    }
  }

  function formatSessionDate(iso: string) {
    try {
      return formatIsoDateTimeLocal(iso);
    } catch {
      return iso;
    }
  }

  return {
    sessions,
    sessionsLoading,
    sessionsError,
    sessionsRevokingId,
    loadAccountSessions,
    revokeSession,
    formatSessionDate,
  };
}
