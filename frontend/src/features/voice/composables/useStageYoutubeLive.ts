import { onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthSessionStore } from '@/stores/authSession';
import { EchoApiError } from '@/api/echo/transport';
import {
  fetchStageYoutubeStream,
  startStageYoutubeStream,
  stopStageYoutubeStream,
  type StageYoutubeStreamStatus,
} from '@/api/echo/stageYoutube';
import { messageForStageYoutubeError } from '@/features/youtube/youtubeIntegrationCopy';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const POLL_MS = 12_000;
/** Cookie session auth; echoFetch ignores bearer and uses credentials. */
const ECHO_API_TOKEN = '';

export function useStageYoutubeLive(opts: {
  echoServerId: () => string;
  stageChannelId: () => string;
  /** When false, polling stops (e.g. left the stage). */
  enabled: () => boolean;
}) {
  const authSession = useAuthSessionStore();
  const { isAuthenticated } = storeToRefs(authSession);

  const stream = ref<StageYoutubeStreamStatus | null>(null);
  const loading = ref(false);
  const actionBusy = ref(false);
  const goLiveTitle = ref('');
  const privacyStatus = ref<'public' | 'unlisted' | 'private'>('unlisted');

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function canPoll(): boolean {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    return (
      isAuthenticated.value &&
      !!serverId &&
      !!channelId &&
      opts.enabled()
    );
  }

  async function refresh() {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    if (!canPoll()) {
      stream.value = null;
      return;
    }
    loading.value = true;
    try {
      stream.value = await fetchStageYoutubeStream(
        ECHO_API_TOKEN,
        serverId,
        channelId,
      );
    } catch {
      stream.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function goLive() {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    if (!canPoll()) return;
    actionBusy.value = true;
    try {
      stream.value = await startStageYoutubeStream(
        ECHO_API_TOKEN,
        serverId,
        channelId,
        {
          title: goLiveTitle.value.trim() || undefined,
          privacyStatus: privacyStatus.value,
        },
      );
      dispatchAppToast('Stage is going live on YouTube.', 'info');
    } catch (e) {
      const code = e instanceof EchoApiError ? e.body.code : null;
      dispatchAppToast(messageForStageYoutubeError(code), 'error');
    } finally {
      actionBusy.value = false;
    }
  }

  async function endLive() {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    if (!canPoll()) return;
    actionBusy.value = true;
    try {
      await stopStageYoutubeStream(ECHO_API_TOKEN, serverId, channelId);
      stream.value = await fetchStageYoutubeStream(
        ECHO_API_TOKEN,
        serverId,
        channelId,
      );
      dispatchAppToast('YouTube live stream ended.', 'info');
    } catch (e) {
      const code = e instanceof EchoApiError ? e.body.code : null;
      dispatchAppToast(messageForStageYoutubeError(code), 'error');
    } finally {
      actionBusy.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    if (!opts.enabled()) return;
    void refresh();
    pollTimer = setInterval(() => void refresh(), POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMounted(() => startPolling());
  onUnmounted(() => stopPolling());

  watch(
    () =>
      [
        opts.echoServerId(),
        opts.stageChannelId(),
        opts.enabled(),
        isAuthenticated.value,
      ] as const,
    () => startPolling(),
  );

  return {
    stream,
    loading,
    actionBusy,
    goLiveTitle,
    privacyStatus,
    refresh,
    goLive,
    endLive,
  };
}
