import { onUnmounted, ref, watch, type Ref, type ShallowRef } from 'vue';
import type { EchoMediaPlaybackSyncV1 } from '@/audio/voiceEchoLiveKitData';

/** Followers apply remote samples keyed by `updatedAt` (newest wins). */
export type VcWatchTogetherRemotePlaybackState = EchoMediaPlaybackSyncV1 & {
  updatedAt: number;
};

const WT_PUBLISH_INTERVAL_MS = 2200;

function expectedMediaTime(sample: EchoMediaPlaybackSyncV1): number {
  if (!sample.playing) return sample.mediaTimeSec;
  return sample.mediaTimeSec + (Date.now() - sample.wallMs) / 1000;
}

/**
 * Guild VC Watch Together: synced HTML5 video element with optional LiveKit
 * playback samples for host → follower sync.
 */
export function useVcWatchTogetherPlayer(opts: {
  videoRef: Ref<HTMLVideoElement | null>;
  hlsManifestUrl: Ref<string | null>;
  remotePlayback: ShallowRef<VcWatchTogetherRemotePlaybackState | null>;
  publish: ((sample: EchoMediaPlaybackSyncV1) => void) | undefined;
  canPublish: Ref<boolean>;
}) {
  const { videoRef, hlsManifestUrl, remotePlayback, publish, canPublish } =
    opts;

  let hlsInstance: import('hls.js').default | null = null;
  let publishInterval: ReturnType<typeof setInterval> | null = null;
  let suppressPublish = false;
  const hlsUnsupported = ref(false);
  const lastPublishedWallMs = ref(0);
  const lastRemoteAppliedUpdatedAt = ref(0);

  function clearPublishInterval() {
    if (publishInterval != null) {
      clearInterval(publishInterval);
      publishInterval = null;
    }
  }

  function destroyHls(): void {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  function snapshotFromVideo(): EchoMediaPlaybackSyncV1 | null {
    const el = videoRef.value;
    if (!el) return null;
    return {
      playing: !el.paused && !el.ended,
      mediaTimeSec: el.currentTime,
      wallMs: Date.now(),
    };
  }

  function publishSample(reason: 'interval' | 'state' | 'seek') {
    if (!publish || !canPublish.value || suppressPublish) return;
    const snap = snapshotFromVideo();
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
    publishInterval = setInterval(
      () => publishSample('interval'),
      WT_PUBLISH_INTERVAL_MS,
    );
  }

  function onPlayStateChange() {
    const el = videoRef.value;
    if (!el) return;
    if (!el.paused && !el.ended) {
      publishSample('state');
      armPublishWhilePlaying();
    } else {
      clearPublishInterval();
      publishSample('state');
    }
  }

  async function attachHls(manifest: string): Promise<void> {
    const el = videoRef.value;
    if (!el) return;

    hlsUnsupported.value = false;
    const savedTime = el.currentTime;
    const wasPlaying = !el.paused;
    destroyHls();

    const { applyEchoUploadMediaCrossOrigin } =
      await import('@/features/chat/echoUploadMediaCredentials');
    applyEchoUploadMediaCrossOrigin(el, manifest);

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = manifest;
      if (savedTime > 0) el.currentTime = savedTime;
      if (wasPlaying) void el.play().catch(() => undefined);
      return;
    }

    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) {
      hlsUnsupported.value = true;
      return;
    }

    hlsInstance = new Hls({
      xhrSetup(xhr) {
        xhr.withCredentials = true;
      },
    });
    hlsInstance.loadSource(manifest);
    hlsInstance.attachMedia(el);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      if (savedTime > 0) el.currentTime = savedTime;
      if (wasPlaying) void el.play().catch(() => undefined);
    });
  }

  function onSeeked() {
    publishSample('seek');
  }

  function wireVideoEvents(el: HTMLVideoElement | null) {
    if (!el) return;
    el.addEventListener('play', onPlayStateChange);
    el.addEventListener('pause', onPlayStateChange);
    el.addEventListener('seeked', onSeeked);
  }

  function unwireVideoEvents(el: HTMLVideoElement | null) {
    if (!el) return;
    el.removeEventListener('play', onPlayStateChange);
    el.removeEventListener('pause', onPlayStateChange);
    el.removeEventListener('seeked', onSeeked);
  }

  watch(
    videoRef,
    (el, prev) => {
      unwireVideoEvents(prev ?? null);
      wireVideoEvents(el ?? null);
    },
    { immediate: true },
  );

  watch(
    hlsManifestUrl,
    (manifest) => {
      lastRemoteAppliedUpdatedAt.value = 0;
      if (!manifest) {
        destroyHls();
        const el = videoRef.value;
        if (el) {
          el.removeAttribute('src');
          el.load();
        }
        return;
      }
      void attachHls(manifest);
    },
    { immediate: true },
  );

  watch(
    () => remotePlayback.value,
    (remote) => {
      const el = videoRef.value;
      if (!remote || !el) return;
      if (remote.updatedAt <= lastRemoteAppliedUpdatedAt.value) return;
      lastRemoteAppliedUpdatedAt.value = remote.updatedAt;

      const target = expectedMediaTime(remote);
      const drift = Math.abs(el.currentTime - target);

      suppressPublish = true;
      try {
        if (drift > 1.25) {
          el.currentTime = target;
        }
        if (remote.playing) {
          void el.play().catch(() => undefined);
        } else {
          el.pause();
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
    unwireVideoEvents(videoRef.value);
    destroyHls();
  });

  return {
    hlsUnsupported,
    publishAfterSourceChange() {
      queueMicrotask(() => {
        publishSample('seek');
        armPublishWhilePlaying();
      });
    },
  };
}
