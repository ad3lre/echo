import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  toValue,
  type MaybeRefOrGetter,
} from 'vue';

/** Default time before auto-pausing local screen-share preview (still publishing). */
export const LOCAL_SCREEN_PREVIEW_IDLE_PAUSE_MS = 90_000;

export type LocalScreenSharePreviewSuspendOptions = {
  /** When true, idle timeout and tab-hide suspend the local preview. */
  enabled: MaybeRefOrGetter<boolean>;
  /** ms without interaction before detaching preview; set ≤0 to disable idle-only pause (tab-hide still applies). */
  idlePauseMs?: number;
};

/**
 * Detaches the screen-capture stream from a local preview {@link HTMLVideoElement}
 * after an idle timeout or when the document is hidden, to cut decode/GPU work.
 * LiveKit publishing is unchanged.
 */
export function useLocalScreenSharePreviewSuspend(
  opts: LocalScreenSharePreviewSuspendOptions,
) {
  const previewSuspended = ref(false);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const idleMs = opts.idlePauseMs ?? LOCAL_SCREEN_PREVIEW_IDLE_PAUSE_MS;

  function clearIdleTimer() {
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function scheduleIdlePause() {
    clearIdleTimer();
    if (!toValue(opts.enabled) || idleMs <= 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      previewSuspended.value = true;
    }, idleMs);
  }

  function onVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (!toValue(opts.enabled)) return;
    if (document.visibilityState === 'hidden') {
      previewSuspended.value = true;
      clearIdleTimer();
    }
  }

  watch(
    () => toValue(opts.enabled),
    (on) => {
      clearIdleTimer();
      if (!on) {
        previewSuspended.value = false;
        return;
      }
      previewSuspended.value = false;
      scheduleIdlePause();
    },
    { immediate: true },
  );

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    clearIdleTimer();
  });

  /** Resume preview if needed and restart the idle countdown. */
  function bumpPreviewActivity() {
    if (!toValue(opts.enabled)) return;
    previewSuspended.value = false;
    scheduleIdlePause();
  }

  return {
    previewSuspended,
    bumpPreviewActivity,
  };
}
