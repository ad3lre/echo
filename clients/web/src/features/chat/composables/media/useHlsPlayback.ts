import { onUnmounted, watch, type Ref } from 'vue';
import type { ChatVideoPlaybackState } from '@/features/chat/composables/useChatVideoPlayback';
import { applyEchoUploadMediaCrossOrigin } from '@/features/chat/echoUploadMediaCredentials';

export type UseHlsPlaybackOptions = {
  disabled?: Ref<boolean>;
  /** Progressive URL when not using HLS manifest on element src. */
  progressiveSrc: Ref<string | undefined>;
};

export function useHlsPlayback(
  videoRef: Ref<HTMLVideoElement | null | undefined>,
  playbackState: Ref<ChatVideoPlaybackState>,
  options: UseHlsPlaybackOptions,
): { destroy: () => void } {
  let hlsInstance: import('hls.js').default | null = null;

  function destroyHls(): void {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  async function attachPlayback(): Promise<void> {
    const el = videoRef.value;
    if (!el || options.disabled?.value) return;

    const savedTime = el.currentTime;
    const wasPlaying = !el.paused;
    destroyHls();

    const state = playbackState.value;
    const manifest = state.playbackUrl;

    if (state.mode !== 'hls' || state.status !== 'ready') {
      const src = options.progressiveSrc.value;
      applyEchoUploadMediaCrossOrigin(el, src);
      if (src && el.src !== src) el.src = src;
      if (savedTime > 0) el.currentTime = savedTime;
      if (wasPlaying) void el.play().catch(() => undefined);
      return;
    }

    applyEchoUploadMediaCrossOrigin(el, manifest);

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = manifest;
      if (savedTime > 0) el.currentTime = savedTime;
      if (wasPlaying) void el.play().catch(() => undefined);
      return;
    }

    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) {
      applyEchoUploadMediaCrossOrigin(el, state.sourceUrl);
      el.src = state.sourceUrl;
      if (savedTime > 0) el.currentTime = savedTime;
      if (wasPlaying) void el.play().catch(() => undefined);
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
    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      destroyHls();
      const fallbackSrc = playbackState.value.sourceUrl;
      applyEchoUploadMediaCrossOrigin(el, fallbackSrc);
      el.src = fallbackSrc;
      if (savedTime > 0) el.currentTime = savedTime;
      if (wasPlaying) void el.play().catch(() => undefined);
    });
  }

  watch(
    () =>
      [
        playbackState.value.mode,
        playbackState.value.status,
        playbackState.value.playbackUrl,
        options.progressiveSrc.value,
        options.disabled?.value,
      ] as const,
    () => {
      void attachPlayback();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    destroyHls();
  });

  return { destroy: destroyHls };
}
