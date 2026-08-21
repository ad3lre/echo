import { onMounted, ref, watch } from 'vue';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { authDiscordOAuthStart } from '@/api/authClient';
import { fetchMeDiscord, type MeDiscordResponse } from '@/api/meClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { messageForDiscordOAuthError } from '@/features/discord/integrationCopy';
import { startOAuthFlow } from '@/platform/desktopBridge';

const DISCORD_REDIRECT_HINT_KEY = 'echo_discord_oauth_redirect_hint';

export function useDiscordLinkSettings() {
  const authSession = useAuthSessionStore();

  const state = ref<MeDiscordResponse | null>(null);
  const loading = ref(false);
  const actionError = ref('');
  const connectBusy = ref(false);
  const lastOAuthRedirectUri = ref('');

  function readDiscordRedirectHintFromStorage() {
    try {
      const u = sessionStorage.getItem(DISCORD_REDIRECT_HINT_KEY)?.trim();
      lastOAuthRedirectUri.value = u ?? '';
    } catch {
      lastOAuthRedirectUri.value = '';
    }
  }

  function clearDiscordRedirectHint() {
    try {
      sessionStorage.removeItem(DISCORD_REDIRECT_HINT_KEY);
    } catch {
      /* ignore */
    }
    lastOAuthRedirectUri.value = '';
  }

  function readOauthReturnError() {
    try {
      const code = sessionStorage.getItem('echo_discord_oauth_error');
      if (code) {
        sessionStorage.removeItem('echo_discord_oauth_error');
        actionError.value = messageForDiscordOAuthError(code);
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
      state.value = await fetchMeDiscord();
      if (state.value?.linked) {
        clearDiscordRedirectHint();
      }
    } catch (e) {
      state.value = null;
      actionError.value =
        e instanceof Error
          ? e.message
          : 'We couldn’t load your Discord link. Try again in a moment.';
    } finally {
      loading.value = false;
    }
  }

  async function onConnect() {
    if (!authSession.isAuthenticated) return;
    connectBusy.value = true;
    actionError.value = '';
    try {
      const { authorizeUrl, redirectUri } = await authDiscordOAuthStart();
      const ru = redirectUri?.trim() ?? '';
      if (ru) {
        try {
          sessionStorage.setItem(DISCORD_REDIRECT_HINT_KEY, ru);
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
          : 'We couldn’t open Discord. Try again in a moment.';
    } finally {
      connectBusy.value = false;
    }
  }

  onMounted(() => {
    readDiscordRedirectHintFromStorage();
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
