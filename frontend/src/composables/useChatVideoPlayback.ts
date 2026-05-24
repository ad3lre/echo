import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { fetchEchoVideoPlayback } from '@/api/echo/uploads';
import { rewriteR2EchoUploadUrlForReadThrough } from '@/utils/rewriteR2EchoUploadUrlForReadThrough';
import { safeImageUrl } from '@/utils/safeImageUrl';

export type ChatVideoPlaybackMode = 'hls' | 'progressive';

export type ChatVideoPlaybackState = {
  status: 'loading' | 'ready' | 'pending' | 'failed';
  mode: ChatVideoPlaybackMode;
  playbackUrl: string;
  sourceUrl: string;
  sourceEtag: string | null;
  sourceSize: number;
};

const DEFAULT_POLL_MS = 4000;

function shouldPoll(status: ChatVideoPlaybackState['status']): boolean {
  return status === 'pending' || status === 'loading';
}

export function useChatVideoPlayback(
  sourceUrl: Ref<string>,
  opts?: { pollMs?: number },
): {
  state: Ref<ChatVideoPlaybackState>;
  refresh: () => void;
} {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const state = ref<ChatVideoPlaybackState>({
    status: 'loading',
    mode: 'progressive',
    playbackUrl: safeImageUrl(sourceUrl.value),
    sourceUrl: safeImageUrl(sourceUrl.value),
    sourceEtag: null,
    sourceSize: 0,
  });

  let requestId = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPoll(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPoll(): void {
    stopPoll();
    pollTimer = setInterval(() => void load({ silent: true }), pollMs);
  }

  function syncPollTimer(): void {
    if (shouldPoll(state.value.status)) {
      startPoll();
    } else {
      stopPoll();
    }
  }

  async function load(options?: { silent?: boolean }): Promise<void> {
    const url = sourceUrl.value.trim();
    const id = ++requestId;
    const fallbackSource = safeImageUrl(url);
    if (!url) {
      state.value = {
        status: 'failed',
        mode: 'progressive',
        playbackUrl: fallbackSource,
        sourceUrl: fallbackSource,
        sourceEtag: null,
        sourceSize: 0,
      };
      stopPoll();
      return;
    }
    if (!options?.silent) {
      stopPoll();
      state.value = {
        ...state.value,
        status: 'loading',
        playbackUrl: fallbackSource,
        sourceUrl: fallbackSource,
      };
    }
    try {
      const res = await fetchEchoVideoPlayback(null, url);
      if (id !== requestId) return;
      const resolvedSource = safeImageUrl(res.sourceUrl || url);
      if (res.status === 'ready' && res.format === 'hls' && res.playbackUrl) {
        state.value = {
          status: 'ready',
          mode: 'hls',
          playbackUrl: rewriteR2EchoUploadUrlForReadThrough(
            safeImageUrl(res.playbackUrl),
          ),
          sourceUrl: resolvedSource,
          sourceEtag: res.sourceEtag,
          sourceSize: res.sourceSize,
        };
        stopPoll();
        return;
      }
      state.value = {
        status: res.status === 'failed' ? 'failed' : 'pending',
        mode: 'progressive',
        playbackUrl: resolvedSource,
        sourceUrl: resolvedSource,
        sourceEtag: res.sourceEtag,
        sourceSize: res.sourceSize,
      };
      syncPollTimer();
    } catch {
      if (id !== requestId) return;
      state.value = {
        status: 'pending',
        mode: 'progressive',
        playbackUrl: fallbackSource,
        sourceUrl: fallbackSource,
        sourceEtag: null,
        sourceSize: 0,
      };
      syncPollTimer();
    }
  }

  watch(
    sourceUrl,
    () => {
      stopPoll();
      void load();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stopPoll();
  });

  return { state, refresh: () => void load() };
}
