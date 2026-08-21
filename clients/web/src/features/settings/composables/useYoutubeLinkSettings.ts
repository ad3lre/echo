import { computed, onMounted, ref, watch } from 'vue';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { authYoutubeOAuthStart, AuthApiError } from '@/api/authClient';
import {
  fetchMeYoutube,
  revokeMeYoutubeStreamKey,
  saveMeYoutubeStreamKey,
  unlinkMeYoutube,
  type MeYoutubeResponse,
} from '@/api/meYoutube';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { messageForYoutubeOAuthError } from '@/features/youtube/youtubeIntegrationCopy';
import { startOAuthFlow } from '@/platform/desktopBridge';

export function useYoutubeLinkSettings() {
  const authSession = useAuthSessionStore();

  const state = ref<MeYoutubeResponse | null>(null);
  const loading = ref(false);
  const actionError = ref('');
  const connectBusy = ref(false);
  const disconnectBusy = ref(false);
  const streamKeyInput = ref('');
  const streamKeyServerUrl = ref('rtmp://a.rtmp.youtube.com/live2');
  const streamKeyBusy = ref(false);
  const streamKeyRevokeBusy = ref(false);
  const streamKeyConfirm = ref(false);
  const pendingOAuthRedirectUri = ref('');

  const lastOAuthRedirectUri = computed(() => {
    const pending = pendingOAuthRedirectUri.value.trim();
    if (pending) return pending;
    const fromApi = state.value?.oauthRedirectUri?.trim();
    return fromApi ?? '';
  });

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
      pendingOAuthRedirectUri.value = '';
      return;
    }
    loading.value = true;
    actionError.value = '';
    try {
      state.value = await fetchMeYoutube();
      if (state.value?.linked) {
        pendingOAuthRedirectUri.value = '';
      }
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
    if (state.value && !state.value.googleLinked) {
      actionError.value =
        'Link your Google account in Settings → Google before connecting YouTube.';
      return;
    }
    connectBusy.value = true;
    actionError.value = '';
    try {
      const { authorizeUrl, redirectUri } = await authYoutubeOAuthStart();
      pendingOAuthRedirectUri.value = redirectUri?.trim() ?? '';
      startOAuthFlow(authorizeUrl);
    } catch (e) {
      if (e instanceof AuthApiError && e.body.code === 'GOOGLE_NOT_LINKED') {
        actionError.value =
          'Link your Google account in Settings → Google before connecting YouTube.';
      } else {
        actionError.value =
          e instanceof Error
            ? e.message
            : 'We couldn’t open YouTube authorization. Try again in a moment.';
      }
    } finally {
      connectBusy.value = false;
    }
  }

  onMounted(() => {
    readOauthReturnError();
    void refresh();
  });

  watch(
    () => authSession.isAuthenticated,
    () => {
      void refresh();
    },
  );

  async function onDisconnectOAuth() {
    disconnectBusy.value = true;
    try {
      await unlinkMeYoutube();
      dispatchAppToast('YouTube channel unlinked.', 'info');
      await refresh();
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not unlink YouTube.',
        'error',
      );
    } finally {
      disconnectBusy.value = false;
    }
  }

  async function onSaveStreamKey() {
    const key = streamKeyInput.value.trim();
    if (!key) {
      dispatchAppToast('Enter your YouTube stream key.', 'error');
      return;
    }
    if (!streamKeyConfirm.value) {
      dispatchAppToast(
        'Confirm that you understand the key cannot be shown again.',
        'error',
      );
      return;
    }
    streamKeyBusy.value = true;
    try {
      await saveMeYoutubeStreamKey({
        streamKey: key,
        serverUrl: streamKeyServerUrl.value.trim() || undefined,
      });
      streamKeyInput.value = '';
      streamKeyConfirm.value = false;
      dispatchAppToast(
        'Stream key saved. Echo will not show it again.',
        'info',
      );
      await refresh();
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not save stream key.',
        'error',
      );
    } finally {
      streamKeyBusy.value = false;
    }
  }

  async function onRevokeStreamKey() {
    streamKeyRevokeBusy.value = true;
    try {
      await revokeMeYoutubeStreamKey();
      dispatchAppToast('Stream key revoked.', 'info');
      await refresh();
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not revoke stream key.',
        'error',
      );
    } finally {
      streamKeyRevokeBusy.value = false;
    }
  }

  return {
    state,
    loading,
    actionError,
    connectBusy,
    disconnectBusy,
    streamKeyInput,
    streamKeyServerUrl,
    streamKeyBusy,
    streamKeyRevokeBusy,
    streamKeyConfirm,
    lastOAuthRedirectUri,
    refresh,
    onConnect,
    onDisconnectOAuth,
    onSaveStreamKey,
    onRevokeStreamKey,
  };
}
