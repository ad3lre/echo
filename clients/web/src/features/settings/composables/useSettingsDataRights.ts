import { echoT } from '@/i18n';
import { ref } from 'vue';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  authDeleteAccount,
  authFetchMe,
  authFetchSessions,
} from '@/api/authClient';
import {
  fetchEchoBlockedUsers,
  fetchEchoDmMessageRequests,
  fetchEchoDmThreads,
  fetchEchoFriendRequests,
  fetchEchoFriends,
} from '@/api/echo/social';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

export function useSettingsDataRights() {
  const authSession = useAuthSessionStore();

  const dataExportInFlight = ref(false);
  const removalInFlight = ref(false);
  const showRemovalModal = ref(false);
  const removalPassword = ref('');
  const removalConfirmText = ref('');
  const removalModalError = ref('');

  async function downloadMyDataExport() {
    if (dataExportInFlight.value) return;
    dataExportInFlight.value = true;
    try {
      const token = authSession.accessToken ?? '';
      const [
        me,
        sessions,
        friends,
        friendRequests,
        blockedUsers,
        dmThreads,
        dmRequests,
      ] = await Promise.all([
        authFetchMe(),
        authFetchSessions().catch(() => ({ sessions: [] })),
        fetchEchoFriends(token).catch(() => ({ friends: [] })),
        fetchEchoFriendRequests(token).catch(() => ({
          incoming: [],
          outgoing: [],
        })),
        fetchEchoBlockedUsers(token).catch(() => ({ blockedUserIds: [] })),
        fetchEchoDmThreads(token).catch(() => ({ threads: [] })),
        fetchEchoDmMessageRequests(token).catch(() => ({ requests: [] })),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        product: 'Echo',
        user: me.user,
        sessions: sessions.sessions,
        social: {
          friends: friends.friends,
          friendRequestsIncoming: friendRequests.incoming,
          friendRequestsOutgoing: friendRequests.outgoing,
          blockedUserIds: blockedUsers.blockedUserIds,
        },
        directMessages: {
          threads: dmThreads.threads,
          messageRequests: dmRequests.requests,
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const username = me.user.username?.trim() || 'echo-user';
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `echo-data-export-${username}-${date}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      dispatchAppToast(echoT('panes.dataRights.exported'), 'info');
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : echoT('panes.dataRights.exportFailed'),
        'warning',
      );
    } finally {
      dataExportInFlight.value = false;
    }
  }

  function openAccountRemovalModal() {
    if (removalInFlight.value) return;
    removalPassword.value = '';
    removalConfirmText.value = '';
    removalModalError.value = '';
    showRemovalModal.value = true;
  }

  function closeAccountRemovalModal() {
    if (removalInFlight.value) return;
    showRemovalModal.value = false;
    removalPassword.value = '';
    removalConfirmText.value = '';
    removalModalError.value = '';
  }

  async function confirmAccountRemoval() {
    if (removalInFlight.value) return;
    if (removalConfirmText.value.trim().toUpperCase() !== 'DELETE') {
      removalModalError.value = echoT('panes.dataRights.typeDelete');
      return;
    }
    removalInFlight.value = true;
    removalModalError.value = '';
    try {
      // Password optional: guest / OAuth-only accounts delete via session.
      await authDeleteAccount(removalPassword.value.trim() || undefined);
      authSession.clearLocalTokens();
      dispatchAppToast(echoT('panes.dataRights.removed'), 'info');
      showRemovalModal.value = false;
    } catch (e) {
      removalModalError.value =
        e instanceof Error ? e.message : echoT('panes.dataRights.removeFailed');
    } finally {
      removalInFlight.value = false;
    }
  }

  return {
    dataExportInFlight,
    removalInFlight,
    showRemovalModal,
    removalPassword,
    removalConfirmText,
    removalModalError,
    downloadMyDataExport,
    openAccountRemovalModal,
    closeAccountRemovalModal,
    confirmAccountRemoval,
  };
}
