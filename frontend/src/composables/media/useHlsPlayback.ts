import { onUnmounted, watch, type Ref } from 'vue';
import type { ChatVideoPlaybackState } from '@/composables/useChatVideoPlayback';

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
    destroyHls();
    const el = videoRef.value;
    if (!el || options.disabled?.value) return;

    const state = playbackState.value;
    const manifest = state.playbackUrl;

    if (state.mode !== 'hls' || state.status !== 'ready') {
      const src = options.progressiveSrc.value;
      if (src) el.src = src;
      return;
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = manifest;
      return;
    }

    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) {
      el.src = state.sourceUrl;
      return;
    }
    hlsInstance = new Hls({
      xhrSetup(xhr) {
        xhr.withCredentials = true;
      },
    });
    hlsInstance.loadSource(manifest);
    hlsInstance.attachMedia(el);
    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      destroyHls();
      el.src = playbackState.value.sourceUrl;
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
