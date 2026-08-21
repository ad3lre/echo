import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { EchoApiError } from '@/api/echo/transport';
import { fetchMeYoutube, type YoutubeConnectionMode } from '@/api/meYoutube';
import {
  fetchStageYoutubeStream,
  startStageYoutubeStream,
  stopStageYoutubeStream,
  updateStageYoutubeStreamLayout,
  type StageYoutubeEgressLayout,
  type StageYoutubeStreamStatus,
} from '@/api/echo/stageYoutube';
import { messageForStageYoutubeError } from '@/features/youtube/youtubeIntegrationCopy';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

const POLL_MS = 12_000;
/** Cookie session auth; echoFetch ignores bearer and uses credentials. */
const ECHO_API_TOKEN = '';

function isActiveStageYoutubeStream(
  value: StageYoutubeStreamStatus | null,
): boolean {
  return !!(
    value?.active &&
    (value.status === 'live' || value.status === 'starting')
  );
}

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
  const goLiveDescription = ref('');
  const privacyStatus = ref<'public' | 'unlisted' | 'private'>('unlisted');
  const egressLayout = ref<StageYoutubeEgressLayout>('grid');
  const connectionMode = ref<YoutubeConnectionMode>('none');
  const youtubeChannelTitle = ref<string | null>(null);
  const youtubeChannelThumbnailUrl = ref<string | null>(null);

  const usesStreamKeyDelivery = computed(
    () => connectionMode.value === 'stream_key',
  );
  const isStreamKeyLive = computed(
    () => stream.value?.streamSource === 'stream_key',
  );

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadConnectionMode() {
    if (!isAuthenticated.value) {
      connectionMode.value = 'none';
      youtubeChannelTitle.value = null;
      youtubeChannelThumbnailUrl.value = null;
      return;
    }
    try {
      const me = await fetchMeYoutube();
      connectionMode.value = me.connectionMode;
      youtubeChannelTitle.value = me.profile?.channelTitle?.trim() || null;
      youtubeChannelThumbnailUrl.value =
        me.profile?.channelThumbnailUrl?.trim() || null;
    } catch {
      connectionMode.value = 'none';
      youtubeChannelTitle.value = null;
      youtubeChannelThumbnailUrl.value = null;
    }
  }

  function canPoll(): boolean {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    return isAuthenticated.value && !!serverId && !!channelId && opts.enabled();
  }

  async function refresh() {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    if (!canPoll()) {
      stream.value = null;
      return;
    }
    loading.value = true;
    const previous = stream.value;
    try {
      stream.value = await fetchStageYoutubeStream(
        ECHO_API_TOKEN,
        serverId,
        channelId,
      );
    } catch {
      // Keep an already-live status visible across transient poll failures.
      if (!isActiveStageYoutubeStream(previous)) {
        stream.value = null;
      }
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
          description: goLiveDescription.value.trim() || undefined,
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

  async function setEgressLayout(layout: StageYoutubeEgressLayout) {
    const serverId = opts.echoServerId().trim();
    const channelId = opts.stageChannelId().trim();
    if (!canPoll()) return;
    actionBusy.value = true;
    try {
      await updateStageYoutubeStreamLayout(
        ECHO_API_TOKEN,
        serverId,
        channelId,
        layout,
      );
      egressLayout.value = layout;
      dispatchAppToast('Stream layout updated.', 'info');
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

  onMounted(() => {
    void loadConnectionMode();
    startPolling();
  });
  onUnmounted(() => stopPolling());

  watch(
    () =>
      [
        opts.echoServerId(),
        opts.stageChannelId(),
        opts.enabled(),
        isAuthenticated.value,
      ] as const,
    () => {
      void loadConnectionMode();
      startPolling();
    },
  );

  return {
    stream,
    loading,
    actionBusy,
    goLiveTitle,
    goLiveDescription,
    privacyStatus,
    youtubeChannelTitle,
    youtubeChannelThumbnailUrl,
    egressLayout,
    setEgressLayout,
    usesStreamKeyDelivery,
    isStreamKeyLive,
    refresh,
    goLive,
    endLive,
  };
}
