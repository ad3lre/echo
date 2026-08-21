import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import { useMediaElementPlayback } from './useMediaElementPlayback';
import { useMediaPlayerIdle } from './useMediaPlayerIdle';
import { useMediaPlayerKeyboard } from './useMediaPlayerKeyboard';
import {
  claimExclusiveMediaPlayback,
  registerExclusiveMediaPlayback,
} from './useExclusiveMediaPlayback';

export type UseEchoMediaPlayerShellOptions = {
  allowFullscreen?: boolean;
};

export function useEchoMediaPlayerShell(
  mediaRef: Ref<HTMLMediaElement | null | undefined>,
  shellRef: Ref<HTMLElement | null | undefined>,
  options: UseEchoMediaPlayerShellOptions = {},
): ReturnType<typeof useMediaElementPlayback> & {
  controlsVisible: Ref<boolean>;
  onShellPointerActivity: () => void;
  onShellPointerLeave: () => void;
  onShellFocusIn: () => void;
  onMediaPlay: () => void;
} {
  const playback = useMediaElementPlayback(mediaRef, {
    fullscreenTarget: shellRef,
  });

  const {
    controlsVisible,
    bumpActivity,
    onShellPointerMove,
    onShellPointerLeave,
    onShellFocusIn,
  } = useMediaPlayerIdle(playback.isPlaying);

  useMediaPlayerKeyboard(
    shellRef,
    mediaRef,
    {
      togglePlay: playback.togglePlay,
      toggleMute: playback.toggleMute,
      seekBy: playback.seekBy,
      setVolume: playback.setVolume,
      toggleFullscreen: playback.toggleFullscreen,
    },
    { allowFullscreen: options.allowFullscreen ?? false },
  );

  let unregisterExclusive: (() => void) | undefined;

  function onPlayExclusive(): void {
    const el = mediaRef.value;
    if (el) claimExclusiveMediaPlayback(el);
  }

  watch(
    mediaRef,
    (el, prev) => {
      prev?.removeEventListener('play', onPlayExclusive);
      unregisterExclusive?.();
      unregisterExclusive = undefined;
      if (el) {
        unregisterExclusive = registerExclusiveMediaPlayback(el);
        el.addEventListener('play', onPlayExclusive);
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    mediaRef.value?.removeEventListener('play', onPlayExclusive);
    unregisterExclusive?.();
  });

  function onMediaPlay(): void {
    onPlayExclusive();
    bumpActivity();
  }

  function onShellPointerActivity(): void {
    onShellPointerMove();
    bumpActivity();
  }

  return {
    ...playback,
    controlsVisible,
    onShellPointerActivity,
    onShellPointerLeave,
    onShellFocusIn,
    onMediaPlay,
  };
}
