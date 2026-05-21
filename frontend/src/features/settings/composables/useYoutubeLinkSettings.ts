import { onMounted, ref, watch } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { authYoutubeOAuthStart } from '@/api/authClient';
import { fetchMeYoutube, type MeYoutubeResponse } from '@/api/meYoutube';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { messageForYoutubeOAuthError } from '@/features/youtube/youtubeIntegrationCopy';
import { startOAuthFlow } from '@/platform/desktopBridge';

const YOUTUBE_REDIRECT_HINT_KEY = 'echo_youtube_oauth_redirect_hint';

export function useYoutubeLinkSettings() {
  const authSession = useAuthSessionStore();

  const state = ref<MeYoutubeResponse | null>(null);
  const loading = ref(false);
  const actionError = ref('');
  const connectBusy = ref(false);
  const lastOAuthRedirectUri = ref('');

  function readRedirectHintFromStorage() {
    try {
      const u = sessionStorage.getItem(YOUTUBE_REDIRECT_HINT_KEY)?.trim();
      lastOAuthRedirectUri.value = u ?? '';
    } catch {
      lastOAuthRedirectUri.value = '';
    }
  }

  function readOauthReturnError() {
    try {
      const code = sessionStorage.getItem('echo_youtube_oauth_error');
      if (code) {
        sessionStorage.removeItem('echo_youtube_oauth_error');
        actionError.value = messageForYoutubeOAuthError(code);
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
      state.value = await fetchMeYoutube();
    } catch (e) {
      state.value = null;
      actionError.value =
        e instanceof Error
          ? e.message
          : 'We couldn’t load your YouTube link. Try again in a moment.';
    } finally {
      loading.value = false;
    }
  }

  async function onConnect() {
    if (!authSession.isAuthenticated) return;
    connectBusy.value = true;
    actionError.value = '';
    try {
      const { authorizeUrl, redirectUri } = await authYoutubeOAuthStart();
      const ru = redirectUri?.trim() ?? '';
      if (ru) {
        try {
          sessionStorage.setItem(YOUTUBE_REDIRECT_HINT_KEY, ru);
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
          : 'We couldn’t open YouTube authorization. Try again in a moment.';
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
