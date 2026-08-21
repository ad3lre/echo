import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { authGoogleOAuthStart } from '@/api/authClient';
import {
  disconnectMeGoogle,
  fetchMeGoogle,
  type MeGoogleResponse,
} from '@/api/meClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { messageForGoogleOAuthError } from '@/features/google/googleIntegrationCopy';
import { startOAuthFlow } from '@/platform/desktopBridge';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

const GOOGLE_OAUTH_ERROR_KEY = 'echo_google_oauth_error';
const GOOGLE_OAUTH_LINKED_KEY = 'echo_google_oauth_linked';

function takeSessionFlag(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === '1') {
      sessionStorage.removeItem(key);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function takeOauthReturnErrorCode(): string | null {
  try {
    const code = sessionStorage.getItem(GOOGLE_OAUTH_ERROR_KEY)?.trim();
    if (code) {
      sessionStorage.removeItem(GOOGLE_OAUTH_ERROR_KEY);
      return code;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useGoogleLinkSettings() {
  const authSession = useAuthSessionStore();
  const { authStateGeneration } = storeToRefs(authSession);

  const state = ref<MeGoogleResponse | null>(null);
  const loading = ref(false);
  const actionError = ref('');
  const connectBusy = ref(false);
  const disconnectBusy = ref(false);
  const pendingOAuthRedirectUri = ref('');

  const lastOAuthRedirectUri = computed(() => {
    const pending = pendingOAuthRedirectUri.value.trim();
    if (pending) return pending;
    const fromApi = state.value?.oauthRedirectUri?.trim();
    return fromApi ?? '';
  });

  async function refresh() {
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode) {
      state.value = null;
      loading.value = false;
      actionError.value = '';
      pendingOAuthRedirectUri.value = '';
      return;
    }
    const oauthErrorCode = takeOauthReturnErrorCode();
    const linkJustSucceeded = takeSessionFlag(GOOGLE_OAUTH_LINKED_KEY);

    loading.value = true;
    actionError.value = '';
    try {
      state.value = await fetchMeGoogle();
      if (state.value?.linked) {
        pendingOAuthRedirectUri.value = '';
      }
    } catch (e) {
      state.value = null;
      actionError.value =
        e instanceof Error
          ? e.message
          : 'We couldn’t load your Google link. Try again in a moment.';
    } finally {
      loading.value = false;
      if (
        !actionError.value &&
        oauthErrorCode &&
        state.value?.linked !== true
      ) {
        actionError.value = messageForGoogleOAuthError(oauthErrorCode);
      }
      if (linkJustSucceeded && state.value?.linked === true) {
        dispatchAppToast('Google account linked.', 'info');
      }
    }
  }

  async function onConnect() {
    if (!authSession.isAuthenticated) return;
    connectBusy.value = true;
    actionError.value = '';
    try {
      const { authorizeUrl, redirectUri } = await authGoogleOAuthStart();
      pendingOAuthRedirectUri.value = redirectUri?.trim() ?? '';
      startOAuthFlow(authorizeUrl);
    } catch (e) {
      actionError.value =
        e instanceof Error
          ? e.message
          : 'We couldn’t open Google authorization. Try again in a moment.';
    } finally {
      connectBusy.value = false;
    }
  }

  onMounted(() => {
    void refresh();
  });

  watch(
    () => authSession.isAuthenticated,
    () => {
      void refresh();
    },
  );

  watch(authStateGeneration, () => {
    void refresh();
  });

  async function onDisconnect() {
    disconnectBusy.value = true;
    try {
      await disconnectMeGoogle();
      dispatchAppToast(
        'Google account disconnected. YouTube was unlinked too.',
        'info',
      );
      await refresh();
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not disconnect Google.',
        'error',
      );
    } finally {
      disconnectBusy.value = false;
    }
  }

  return {
    state,
    loading,
    actionError,
    connectBusy,
    disconnectBusy,
    lastOAuthRedirectUri,
    refresh,
    onConnect,
    onDisconnect,
  };
}
