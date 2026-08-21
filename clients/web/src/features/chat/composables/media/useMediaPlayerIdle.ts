import { onUnmounted, ref, watch, type Ref } from 'vue';

const DEFAULT_HIDE_MS = 3000;

export function useMediaPlayerIdle(
  isPlaying: Ref<boolean>,
  options: { hideAfterMs?: number } = {},
): {
  controlsVisible: Ref<boolean>;
  bumpActivity: () => void;
  onShellPointerMove: () => void;
  onShellPointerLeave: () => void;
  onShellFocusIn: () => void;
} {
  const hideAfterMs = options.hideAfterMs ?? DEFAULT_HIDE_MS;
  const controlsVisible = ref(true);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearHideTimer(): void {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide(): void {
    clearHideTimer();
    if (!isPlaying.value) {
      controlsVisible.value = true;
      return;
    }
    hideTimer = setTimeout(() => {
      controlsVisible.value = false;
      hideTimer = null;
    }, hideAfterMs);
  }

  function bumpActivity(): void {
    controlsVisible.value = true;
    scheduleHide();
  }

  function onShellPointerMove(): void {
    bumpActivity();
  }

  function onShellPointerLeave(): void {
    if (isPlaying.value) scheduleHide();
  }

  function onShellFocusIn(): void {
    bumpActivity();
  }

  watch(isPlaying, (playing) => {
    if (!playing) {
      clearHideTimer();
      controlsVisible.value = true;
    } else {
      scheduleHide();
    }
  });

  onUnmounted(() => {
    clearHideTimer();
  });

  return {
    controlsVisible,
    bumpActivity,
    onShellPointerMove,
    onShellPointerLeave,
    onShellFocusIn,
  };
}
