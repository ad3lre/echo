import { onMounted, ref, watch } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { authGoogleOAuthStart } from '@/api/authClient';
import { fetchMeGoogle, type MeGoogleResponse } from '@/api/meClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { messageForGoogleOAuthError } from '@/features/google/googleIntegrationCopy';
import { startOAuthFlow } from '@/platform/desktopBridge';

const GOOGLE_REDIRECT_HINT_KEY = 'echo_google_oauth_redirect_hint';

export function useGoogleLinkSettings() {
  const authSession = useAuthSessionStore();

  const state = ref<MeGoogleResponse | null>(null);
  const loading = ref(false);
  const actionError = ref('');
  const connectBusy = ref(false);
  const lastOAuthRedirectUri = ref('');

  function readRedirectHintFromStorage() {
    try {
      const u = sessionStorage.getItem(GOOGLE_REDIRECT_HINT_KEY)?.trim();
      lastOAuthRedirectUri.value = u ?? '';
    } catch {
      lastOAuthRedirectUri.value = '';
    }
  }

  function clearRedirectHint() {
    try {
      sessionStorage.removeItem(GOOGLE_REDIRECT_HINT_KEY);
    } catch {
      /* ignore */
    }
    lastOAuthRedirectUri.value = '';
  }

  function readOauthReturnError() {
    try {
      const code = sessionStorage.getItem('echo_google_oauth_error');
      if (code) {
        sessionStorage.removeItem('echo_google_oauth_error');
        actionError.value = messageForGoogleOAuthError(code);
      }
    } catch {
      /* ignore */
    }
  }

  async function refresh() {
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode) {
      state.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    actionError.value = '';
    try {
      state.value = await fetchMeGoogle();
      if (state.value?.linked) {
        clearRedirectHint();
      }
    } catch (e) {
      state.value = null;
      actionError.value =
        e instanceof Error
          ? e.message
          : 'We couldn’t load your Google link. Try again in a moment.';
    } finally {
      loading.value = false;
    }
  }

  async function onConnect() {
    if (!authSession.isAuthenticated) return;
    connectBusy.value = true;
    actionError.value = '';
    try {
      const { authorizeUrl, redirectUri } = await authGoogleOAuthStart();
      const ru = redirectUri?.trim() ?? '';
      if (ru) {
        try {
          sessionStorage.setItem(GOOGLE_REDIRECT_HINT_KEY, ru);
        } catch {
          /* ignore */
        }
        lastOAuthRedirectUri.value = ru;
      }
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
    readRedirectHintFromStorage();
    readOauthReturnError();
    void refresh();
  });

  watch(
    () => authSession.isAuthenticated,
    () => {
      void refresh();
    },
  );

  return {
    state,
    loading,
    actionError,
    connectBusy,
    lastOAuthRedirectUri,
    refresh,
    onConnect,
  };
}
