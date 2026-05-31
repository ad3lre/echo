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

const DEFAULT_POLL_MS = 2000;

/** Module cache so remounting the player does not re-enter loading/processing. */
const playbackCache = new Map<string, ChatVideoPlaybackState>();

function cacheKey(url: string): string {
  return url.trim();
}

function shouldPoll(status: ChatVideoPlaybackState['status']): boolean {
  return status === 'pending' || status === 'loading';
}

function rememberPlayback(url: string, state: ChatVideoPlaybackState): void {
  const key = cacheKey(url);
  if (!key) return;
  playbackCache.set(key, state);
}

function resolveEchoUploadPlaybackUrl(raw: string): string {
  return rewriteR2EchoUploadUrlForReadThrough(safeImageUrl(raw));
}

export function useChatVideoPlayback(
  sourceUrl: Ref<string>,
  opts?: { pollMs?: number },
): {
  state: Ref<ChatVideoPlaybackState>;
  refresh: () => void;
} {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const initialUrl = sourceUrl.value.trim();
  const cached = initialUrl
    ? playbackCache.get(cacheKey(initialUrl))
    : undefined;
  const state = ref<ChatVideoPlaybackState>(
    cached ?? {
      status: 'loading',
      mode: 'progressive',
      playbackUrl: resolveEchoUploadPlaybackUrl(sourceUrl.value),
      sourceUrl: resolveEchoUploadPlaybackUrl(sourceUrl.value),
      sourceEtag: null,
      sourceSize: 0,
    },
  );

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
    const fallbackSource = resolveEchoUploadPlaybackUrl(url);
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

    const hit = playbackCache.get(cacheKey(url));
    if (hit && !options?.silent) {
      state.value = hit;
      syncPollTimer();
      void load({ silent: true });
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
      const resolvedSource = resolveEchoUploadPlaybackUrl(res.sourceUrl || url);
      if (res.status === 'ready' && res.format === 'hls' && res.playbackUrl) {
        const next: ChatVideoPlaybackState = {
          status: 'ready',
          mode: 'hls',
          playbackUrl: resolveEchoUploadPlaybackUrl(res.playbackUrl),
          sourceUrl: resolvedSource,
          sourceEtag: res.sourceEtag,
          sourceSize: res.sourceSize,
        };
        state.value = next;
        rememberPlayback(url, next);
        stopPoll();
        return;
      }
      const next: ChatVideoPlaybackState = {
        status: res.status === 'failed' ? 'failed' : 'pending',
        mode: 'progressive',
        playbackUrl: resolvedSource,
        sourceUrl: resolvedSource,
        sourceEtag: res.sourceEtag,
        sourceSize: res.sourceSize,
      };
      state.value = next;
      rememberPlayback(url, next);
      syncPollTimer();
    } catch {
      if (id !== requestId) return;
      const next: ChatVideoPlaybackState = {
        status: 'pending',
        mode: 'progressive',
        playbackUrl: fallbackSource,
        sourceUrl: fallbackSource,
        sourceEtag: null,
        sourceSize: 0,
      };
      state.value = next;
      rememberPlayback(url, next);
      syncPollTimer();
    }
  }

  watch(
    sourceUrl,
    () => {
      stopPoll();
      const url = sourceUrl.value.trim();
      const hit = url ? playbackCache.get(cacheKey(url)) : undefined;
      if (hit) {
        state.value = hit;
        syncPollTimer();
        void load({ silent: true });
        return;
      }
      void load();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stopPoll();
  });

  return { state, refresh: () => void load() };
}

/** @internal test helper */
export function __clearChatVideoPlaybackCacheForTests(): void {
  playbackCache.clear();
}
