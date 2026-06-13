import { onScopeDispose, ref, watch, type Ref } from 'vue';
import {
  fetchEchoVideoPlayback,
  retryEchoVideoPlaybackTranscode,
} from '@/api/echo/uploads';
import { EchoApiError } from '@/api/echo/transport';
import { rewriteR2EchoUploadUrlForReadThrough } from '@/utils/rewriteR2EchoUploadUrlForReadThrough';
import { safeImageUrl } from '@/utils/safeImageUrl';

export type VcWatchTogetherPlaybackState = {
  status: 'loading' | 'ready' | 'pending' | 'processing' | 'failed';
  hlsManifestUrl: string | null;
  sourceUrl: string;
  lastError: string | null;
};

const DEFAULT_POLL_MS = 2500;

function resolvePlaybackUrl(raw: string): string {
  return rewriteR2EchoUploadUrlForReadThrough(safeImageUrl(raw));
}

function shouldPoll(status: VcWatchTogetherPlaybackState['status']): boolean {
  return (
    status === 'pending' || status === 'processing' || status === 'loading'
  );
}

export function useVcWatchTogetherHlsPlayback(
  sourceUrl: Ref<string>,
  opts?: { pollMs?: number; token?: Ref<string | null> },
): {
  state: Ref<VcWatchTogetherPlaybackState>;
  refresh: () => void;
  retryTranscode: () => Promise<void>;
} {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const state = ref<VcWatchTogetherPlaybackState>({
    status: 'loading',
    hlsManifestUrl: null,
    sourceUrl: resolvePlaybackUrl(sourceUrl.value),
    lastError: null,
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
    if (shouldPoll(state.value.status)) startPoll();
    else stopPoll();
  }

  async function load(options?: { silent?: boolean }): Promise<void> {
    const url = sourceUrl.value.trim();
    const id = ++requestId;
    const resolvedSource = resolvePlaybackUrl(url);
    if (!url) {
      state.value = {
        status: 'failed',
        hlsManifestUrl: null,
        sourceUrl: resolvedSource,
        lastError: 'Missing source URL',
      };
      stopPoll();
      return;
    }

    if (!options?.silent) {
      stopPoll();
      state.value = {
        ...state.value,
        status: 'loading',
        sourceUrl: resolvedSource,
      };
    }

    try {
      const token = opts?.token?.value ?? null;
      const res = await fetchEchoVideoPlayback(token, url);
      if (id !== requestId) return;
      const source = resolvePlaybackUrl(res.sourceUrl || url);
      if (res.status === 'ready' && res.format === 'hls' && res.playbackUrl) {
        state.value = {
          status: 'ready',
          hlsManifestUrl: resolvePlaybackUrl(res.playbackUrl),
          sourceUrl: source,
          lastError: null,
        };
        stopPoll();
        return;
      }
      const nextStatus =
        res.status === 'failed'
          ? 'failed'
          : res.status === 'processing'
            ? 'processing'
            : 'pending';
      state.value = {
        status: nextStatus,
        hlsManifestUrl: null,
        sourceUrl: source,
        lastError: res.lastError?.trim() || null,
      };
      syncPollTimer();
    } catch (e) {
      if (id !== requestId) return;
      const message =
        e instanceof EchoApiError
          ? e.body.message?.trim() || `Request failed (${e.status})`
          : e instanceof Error
            ? e.message
            : 'Playback check failed';
      const isClientError =
        e instanceof EchoApiError && e.status >= 400 && e.status < 500;
      state.value = {
        status: isClientError ? 'failed' : 'pending',
        hlsManifestUrl: null,
        sourceUrl: resolvedSource,
        lastError: isClientError ? message : null,
      };
      syncPollTimer();
    }
  }

  async function retryTranscode(): Promise<void> {
    const url = sourceUrl.value.trim();
    if (!url) return;
    const token = opts?.token?.value ?? null;
    await retryEchoVideoPlaybackTranscode(token, url);
    state.value = {
      ...state.value,
      status: 'processing',
      lastError: null,
    };
    syncPollTimer();
    await load({ silent: true });
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

  return {
    state,
    refresh: () => void load(),
    retryTranscode,
  };
}
