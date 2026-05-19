import {
  nextTick,
  onUnmounted,
  ref,
  watch,
  type Ref,
  type ShallowRef,
  shallowRef,
} from 'vue';
import type { EchoYoutubePlaybackSyncV1 } from '@/audio/voiceEchoLiveKitData';

/** Followers apply remote samples keyed by `updatedAt` (newest wins). */
export type VcYoutubeRemotePlaybackState = EchoYoutubePlaybackSyncV1 & {
  updatedAt: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- YouTube IFrame API global */
type YTNamespace = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const YT_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

let iframeApiLoadPromise: Promise<YTNamespace> | null = null;

function loadYoutubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('no window'));
  }
  const w = window as Window & {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: (() => void) | undefined;
  };
  if (w.YT?.Player) return Promise.resolve(w.YT);

  if (iframeApiLoadPromise) return iframeApiLoadPromise;

  iframeApiLoadPromise = new Promise((resolve, reject) => {
    const prior = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        prior?.();
      } catch {
        /* ignore */
      }
      if (w.YT?.Player) resolve(w.YT);
      else reject(new Error('YouTube IFrame API missing'));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YT_IFRAME_API_SRC}"]`,
    );
    if (existing) {
      if (w.YT?.Player) {
        resolve(w.YT);
        return;
      }
      existing.addEventListener(
        'error',
        () => reject(new Error('YouTube script failed')),
        { once: true },
      );
      return;
    }
    const tag = document.createElement('script');
    tag.src = YT_IFRAME_API_SRC;
    tag.async = true;
    tag.onerror = () => {
      iframeApiLoadPromise = null;
      reject(new Error('YouTube script failed'));
    };
    document.head.appendChild(tag);
  });

  return iframeApiLoadPromise;
}

function expectedMediaTime(sample: EchoYoutubePlaybackSyncV1): number {
  if (!sample.playing) return sample.mediaTimeSec;
  return sample.mediaTimeSec + (Date.now() - sample.wallMs) / 1000;
}

/**
 * YouTube “watch together”: controlled iframe via IFrame API, optional LiveKit
 * playback samples for host → follower sync.
 */
export function useVcYoutubeWatchTogetherPlayer(opts: {
  containerRef: Ref<HTMLElement | null>;
  videoId: Ref<string | null>;
  remotePlayback: ShallowRef<VcYoutubeRemotePlaybackState | null>;
  publish: ((sample: EchoYoutubePlaybackSyncV1) => void) | undefined;
  canPublish: Ref<boolean>;
}) {
  const { containerRef, videoId, remotePlayback, publish, canPublish } = opts;

  const player = shallowRef<any>(null);
  let destroyInFlight: Promise<void> | null = null;
  let publishInterval: ReturnType<typeof setInterval> | null = null;
  let suppressPublish = false;
  const lastPublishedWallMs = ref(0);
  const lastRemoteAppliedUpdatedAt = ref(0);

  function clearPublishInterval() {
    if (publishInterval != null) {
      clearInterval(publishInterval);
      publishInterval = null;
    }
  }

  function snapshotFromPlayer(): EchoYoutubePlaybackSyncV1 | null {
    const p = player.value;
    if (!p?.getCurrentTime || !p.getPlayerState) return null;
    const st = p.getPlayerState();
    const playing = st === 1; // YT.PlayerState.PLAYING
    return {
      playing,
      mediaTimeSec: p.getCurrentTime(),
      wallMs: Date.now(),
    };
  }

  function publishSample(reason: 'interval' | 'state' | 'seek') {
    if (!publish || !canPublish.value || suppressPublish) return;
    const snap = snapshotFromPlayer();
    if (!snap) return;
    if (reason === 'interval' && !snap.playing) return;
    if (
      snap.wallMs - lastPublishedWallMs.value < 400 &&
      reason === 'interval'
    ) {
      return;
    }
    lastPublishedWallMs.value = snap.wallMs;
    publish(snap);
  }

  function armPublishWhilePlaying() {
    clearPublishInterval();
    if (!publish || !canPublish.value) return;
    publishInterval = setInterval(() => publishSample('interval'), 2200);
  }

  function onPlayerStateChange(ev: { data: number; target?: any }) {
    const st = ev.data;
    const playing = st === 1;
    if (playing) {
      publishSample('state');
      armPublishWhilePlaying();
    } else {
      clearPublishInterval();
      publishSample('state');
    }
  }

  async function destroyPlayer(): Promise<void> {
    clearPublishInterval();
    const p = player.value;
    player.value = null;
    if (!p?.destroy) return;
    try {
      p.destroy();
    } catch {
      /* ignore */
    }
  }

  async function ensurePlayerForVideo(id: string): Promise<void> {
    const el = containerRef.value;
    if (!el) return;

    await destroyPlayer();
    el.innerHTML = '';

    const div = document.createElement('div');
    div.id = `echo-yt-player-${id}-${Math.random().toString(36).slice(2, 9)}`;
    el.appendChild(div);

    const YT = await loadYoutubeIframeApi();
    const origin =
      typeof window !== 'undefined' ? window.location.origin : undefined;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) reject(new Error('YouTube player timeout'));
      }, 20000);
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve();
      };
      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      };

      try {
        new YT.Player(div.id, {
          height: '100%',
          width: '100%',
          host: 'https://www.youtube-nocookie.com',
          videoId: id,
          playerVars: {
            rel: 0,
            enablejsapi: 1,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (e: { target: any }) => {
              player.value = e.target;
              done();
            },
            onStateChange: onPlayerStateChange,
            onError: () => fail(new Error('YouTube player error')),
          },
        });
      } catch (e) {
        fail(e);
      }
    });
  }

  watch(
    videoId,
    (id) => {
      destroyInFlight = (async () => {
        await nextTick();
        lastRemoteAppliedUpdatedAt.value = 0;
        if (!id) {
          await destroyPlayer();
          if (containerRef.value) containerRef.value.innerHTML = '';
          return;
        }
        try {
          await ensurePlayerForVideo(id);
        } catch {
          await destroyPlayer();
        } finally {
          destroyInFlight = null;
        }
      })();
    },
    { immediate: true },
  );

  watch(
    () => remotePlayback.value,
    (remote) => {
      if (!remote || !player.value?.getCurrentTime) return;
      if (remote.updatedAt <= lastRemoteAppliedUpdatedAt.value) return;
      lastRemoteAppliedUpdatedAt.value = remote.updatedAt;

      const p = player.value;
      const target = expectedMediaTime(remote);
      let cur: number;
      try {
        cur = p.getCurrentTime();
      } catch {
        return;
      }
      const drift = Math.abs(cur - target);

      suppressPublish = true;
      try {
        if (drift > 1.25) {
          p.seekTo?.(target, true);
        }
        if (remote.playing) {
          p.playVideo?.();
        } else {
          p.pauseVideo?.();
        }
      } catch {
        /* ignore */
      }
      queueMicrotask(() => {
        suppressPublish = false;
      });
    },
    { flush: 'post' },
  );

  onUnmounted(() => {
    clearPublishInterval();
    void destroyPlayer();
  });

  return {
    /** After host swaps video, publish one sample once the new player is ready. */
    publishAfterVideoChange() {
      queueMicrotask(() => {
        publishSample('seek');
        armPublishWhilePlaying();
      });
    },
  };
}
