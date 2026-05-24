import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { mediaBufferedPercent } from './mediaPlayerFormat';
import {
  elementSupportsFullscreen,
  exitDocumentFullscreen,
  getFullscreenElement,
  isElementFullscreen,
  requestElementFullscreen,
} from '@/utils/domFullscreen';
import {
  normalizePlaybackRate,
  readStoredPlaybackRate,
  writeStoredPlaybackRate,
  type MediaPlaybackRate,
} from './mediaPlaybackRates';

export type UseMediaElementPlaybackOptions = {
  /** Element whose `requestFullscreen` is used (defaults to media parent). */
  fullscreenTarget?: Ref<HTMLElement | null | undefined>;
};

export function useMediaElementPlayback(
  mediaRef: Ref<HTMLMediaElement | null | undefined>,
  options: UseMediaElementPlaybackOptions = {},
): {
  isPlaying: Ref<boolean>;
  isWaiting: Ref<boolean>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  bufferedPercent: Ref<number>;
  volume: Ref<number>;
  muted: Ref<boolean>;
  playbackRate: Ref<number>;
  isFullscreen: Ref<boolean>;
  canFullscreen: ComputedRef<boolean>;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleFullscreen: () => Promise<void>;
} {
  const isPlaying = ref(false);
  const isWaiting = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const bufferedPercent = ref(0);
  const volume = ref(1);
  const muted = ref(false);
  const playbackRate = ref(readStoredPlaybackRate());
  const isFullscreen = ref(false);

  const canFullscreen = computed(() =>
    elementSupportsFullscreen(fullscreenEl() ?? undefined),
  );

  function syncFromElement(): void {
    const el = mediaRef.value;
    if (!el) return;
    isPlaying.value = !el.paused && !el.ended;
    isWaiting.value =
      el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !el.paused;
    currentTime.value = el.currentTime;
    duration.value = Number.isFinite(el.duration) ? el.duration : 0;
    bufferedPercent.value = mediaBufferedPercent(el);
    volume.value = el.volume;
    muted.value = el.muted;
    playbackRate.value = normalizePlaybackRate(el.playbackRate);
  }

  function togglePlay(): void {
    const el = mediaRef.value;
    if (!el) return;
    if (el.paused || el.ended) {
      void el.play();
    } else {
      el.pause();
    }
  }

  function seek(time: number): void {
    const el = mediaRef.value;
    if (!el || !Number.isFinite(duration.value) || duration.value <= 0) return;
    el.currentTime = Math.max(0, Math.min(duration.value, time));
    syncFromElement();
  }

  function seekBy(delta: number): void {
    seek(currentTime.value + delta);
  }

  function setVolume(v: number): void {
    const el = mediaRef.value;
    if (!el) return;
    const clamped = Math.max(0, Math.min(1, v));
    el.volume = clamped;
    if (clamped > 0) el.muted = false;
    syncFromElement();
  }

  function toggleMute(): void {
    const el = mediaRef.value;
    if (!el) return;
    el.muted = !el.muted;
    syncFromElement();
  }

  function setPlaybackRate(rate: number): void {
    const el = mediaRef.value;
    if (!el) return;
    const normalized = normalizePlaybackRate(rate);
    el.playbackRate = normalized;
    el.defaultPlaybackRate = normalized;
    playbackRate.value = normalized;
    writeStoredPlaybackRate(normalized as MediaPlaybackRate);
  }

  function fullscreenEl(): HTMLElement | null | undefined {
    return options.fullscreenTarget?.value ?? mediaRef.value?.parentElement;
  }

  async function toggleFullscreen(): Promise<void> {
    if (!canFullscreen.value) return;
    const target = fullscreenEl();
    if (!target) return;
    if (document.fullscreenElement === target) {
      await document.exitFullscreen();
    } else {
      await target.requestFullscreen();
    }
  }

  function onFullscreenChange(): void {
    const target = fullscreenEl();
    isFullscreen.value = !!target && document.fullscreenElement === target;
  }

  function bind(el: HTMLMediaElement): void {
    const events = [
      'play',
      'pause',
      'ended',
      'timeupdate',
      'durationchange',
      'loadedmetadata',
      'progress',
      'waiting',
      'playing',
      'canplay',
      'volumechange',
      'ratechange',
    ] as const;
    for (const ev of events) {
      el.addEventListener(ev, syncFromElement);
    }
    const stored = readStoredPlaybackRate();
    el.playbackRate = stored;
    el.defaultPlaybackRate = stored;
    syncFromElement();
  }

  function unbind(el: HTMLMediaElement): void {
    const events = [
      'play',
      'pause',
      'ended',
      'timeupdate',
      'durationchange',
      'loadedmetadata',
      'progress',
      'waiting',
      'playing',
      'canplay',
      'volumechange',
      'ratechange',
    ] as const;
    for (const ev of events) {
      el.removeEventListener(ev, syncFromElement);
    }
  }

  watch(
    mediaRef,
    (el, prev) => {
      if (prev) unbind(prev);
      if (el) bind(el);
      else syncFromElement();
    },
    { immediate: true },
  );

  onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    onFullscreenChange();
  });

  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    const el = mediaRef.value;
    if (el) unbind(el);
  });

  return {
    isPlaying,
    isWaiting,
    currentTime,
    duration,
    bufferedPercent,
    volume,
    muted,
    playbackRate,
    isFullscreen,
    canFullscreen,
    togglePlay,
    seek,
    seekBy,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
  };
}
