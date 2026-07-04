import {
  computed,
  onUnmounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  echoMediaUrlNeedsSigning,
  resolveSignedEchoMediaUrl,
} from '@/services/mediaCdn';
import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';
import { captureImageFirstFrameDataUrl } from '@/utils/gifFirstFrame';
import {
  fetchGifOneLoopDurationMs,
  gifPlaybackCacheBustUrl,
} from '@/utils/gifOneLoopDuration';

/** Default loops before freezing; each hover (or remount) restarts this budget. */
export const ECHO_GIF_MAX_LOOPS = 3;
const FALLBACK_LOOP_MS = 2200;

export function useLimitedGifPlayback(options: {
  imageUrl: MaybeRefOrGetter<string>;
  sessionKey: MaybeRefOrGetter<string>;
  storageKey?: MaybeRefOrGetter<string | undefined>;
  forceActive?: MaybeRefOrGetter<boolean | undefined>;
  /** When true, treat as animated GIF even if URL is Echo-hosted (no giphy/tenor markers). */
  forceGif?: MaybeRefOrGetter<boolean | undefined>;
  maxLoops?: number;
  fallbackLoopMs?: number;
  reducedMotion?: MaybeRefOrGetter<boolean>;
  /** When true, GIF never animates (first frame only; no hover replay). */
  staticOnly?: MaybeRefOrGetter<boolean>;
}) {
  const maxLoops = options.maxLoops ?? ECHO_GIF_MAX_LOOPS;
  const fallbackLoopMs = options.fallbackLoopMs ?? FALLBACK_LOOP_MS;

  const safeUrl = ref('');
  let safeUrlRequestId = 0;

  watch(
    () => [toValue(options.imageUrl), toValue(options.storageKey)] as const,
    ([raw, storageKey]) => {
      const id = ++safeUrlRequestId;
      const trimmed = raw?.trim() ?? '';
      if (!trimmed) {
        safeUrl.value = '';
        return;
      }
      const safe = safeImageUrl(trimmed);
      if (!safe || safe === safeImageUrl('')) {
        safeUrl.value = '';
        return;
      }
      // Unsigned media-cdn object URLs return 403; never assign them to <img>.
      if (!echoMediaUrlNeedsSigning(safe)) {
        safeUrl.value = safe;
        return;
      }
      void resolveSignedEchoMediaUrl({ url: safe, storageKey }).then(
        (signed) => {
          if (id === safeUrlRequestId) safeUrl.value = signed;
        },
      );
    },
    { immediate: true },
  );

  const isGif = computed(
    () =>
      toValue(options.forceGif) === true ||
      isLikelyGifImageUrl(toValue(options.imageUrl)),
  );
  const forceActiveRef = computed(() => toValue(options.forceActive) ?? false);
  const reducedMotionRef = computed(
    () => toValue(options.reducedMotion) ?? false,
  );
  const staticOnlyRef = computed(() => toValue(options.staticOnly) ?? false);

  const staticFrame = ref<string | null>(null);
  const localHover = ref(false);
  const epoch = ref(0);
  const introElapsed = ref(false);
  const pendingStopWhenInactive = ref(false);
  const showAnimated = ref(true);

  let introTimer: ReturnType<typeof setTimeout> | null = null;
  let staticCaptureSeq = 0;
  /** Bumped when URL/session changes or pointer enters—invalidates in-flight stop timers. */
  let stopGeneration = 0;

  function clearIntroTimer() {
    if (introTimer !== null) {
      clearTimeout(introTimer);
      introTimer = null;
    }
  }

  function interactionOn(): boolean {
    return localHover.value || forceActiveRef.value;
  }

  function armStopTimer(gen: number) {
    clearIntroTimer();
    if (reducedMotionRef.value) {
      introElapsed.value = true;
      showAnimated.value = false;
      return;
    }
    void fetchGifOneLoopDurationMs(safeUrl.value).then((ms) => {
      if (gen !== stopGeneration) return;
      const loopMs = ms && ms > 0 ? ms : fallbackLoopMs;
      clearIntroTimer();
      introTimer = setTimeout(() => {
        introTimer = null;
        if (gen !== stopGeneration) return;
        introElapsed.value = true;
        if (!interactionOn()) {
          showAnimated.value = false;
        } else {
          pendingStopWhenInactive.value = true;
        }
      }, maxLoops * loopMs);
    });
  }

  watch(
    () =>
      [
        toValue(options.sessionKey),
        toValue(options.imageUrl),
        safeUrl.value,
        reducedMotionRef.value,
        staticOnlyRef.value,
      ] as const,
    () => {
      if (!safeUrl.value.trim()) return;
      clearIntroTimer();
      stopGeneration += 1;
      introElapsed.value = false;
      pendingStopWhenInactive.value = false;
      staticFrame.value = null;
      localHover.value = false;

      if (!isGif.value) {
        showAnimated.value = true;
        return;
      }

      const my = ++staticCaptureSeq;

      if (staticOnlyRef.value) {
        showAnimated.value = false;
        void captureImageFirstFrameDataUrl(safeUrl.value).then((u) => {
          if (my !== staticCaptureSeq) return;
          staticFrame.value = u;
        });
        return;
      }

      const gen = stopGeneration;
      showAnimated.value = !reducedMotionRef.value;
      epoch.value += 1;

      void captureImageFirstFrameDataUrl(safeUrl.value).then((u) => {
        if (my !== staticCaptureSeq) return;
        staticFrame.value = u;
      });

      armStopTimer(gen);
    },
    { immediate: true },
  );

  watch(
    () => localHover.value || forceActiveRef.value,
    (active, prev) => {
      if (!isGif.value) return;
      if (staticOnlyRef.value) return;
      if (reducedMotionRef.value) {
        showAnimated.value = false;
        return;
      }
      if (active) {
        /* Session watch already armed the first timer on mount. */
        if (prev === undefined) return;
        stopGeneration += 1;
        const gen = stopGeneration;
        epoch.value += 1;
        introElapsed.value = false;
        pendingStopWhenInactive.value = false;
        showAnimated.value = true;
        armStopTimer(gen);
      } else if (
        prev === true &&
        (pendingStopWhenInactive.value || introElapsed.value)
      ) {
        showAnimated.value = false;
        pendingStopWhenInactive.value = false;
      }
    },
  );

  onUnmounted(() => clearIntroTimer());

  const animSrc = computed(() =>
    gifPlaybackCacheBustUrl(safeUrl.value, epoch.value),
  );

  function onPointerEnter() {
    localHover.value = true;
  }
  function onPointerLeave() {
    localHover.value = false;
  }

  return {
    safeUrl,
    isGif,
    staticFrame,
    showAnimated,
    animSrc,
    epoch,
    onPointerEnter,
    onPointerLeave,
  };
}
