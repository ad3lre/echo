<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRef,
  watch,
} from 'vue';
import type { StyleValue } from 'vue';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { useChatVideoPlayback } from '@/composables/useChatVideoPlayback';
import { useHlsPlayback } from '@/composables/media/useHlsPlayback';
import { useEchoMediaPlayerShell } from '@/composables/media/useEchoMediaPlayerShell';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import { echoUploadMediaCrossOrigin } from '@/utils/echoUploadMediaCredentials';
import { extractStorageKeyFromEchoMediaUrl } from '@shared/echoUploadStorageKey';
import MediaUnavailablePanel from '@/features/chat/components/MediaUnavailablePanel.vue';
import EchoMediaPlayerShell from './EchoMediaPlayerShell.vue';
import EchoMediaControls from './EchoMediaControls.vue';
import {
  VIDEO_COMPACT_MAX_HEIGHT,
  VIDEO_COMPACT_MAX_WIDTH,
  VIDEO_EXPANDED_MAX_HEIGHT,
  VIDEO_EXPANDED_MAX_WIDTH,
  isPortraitAspectRatio,
} from './echoVideoPlayerSizing';

const props = defineProps<{
  url: string;
  storageKey?: string;
  filename?: string;
  spoiler?: boolean;
  /** Known width/height from attachment metadata — constrains inline size like images. */
  mediaStyle?: StyleValue;
}>();

const emit = defineEmits<{
  (e: 'error'): void;
}>();

const revealed = ref(!props.spoiler);
const loadFailed = ref(false);
const hasRenderableFrame = ref(false);
const shouldLoadMedia = ref(false);
const expanded = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
const shellRef = ref<InstanceType<typeof EchoMediaPlayerShell> | null>(null);

const VIDEO_EXPAND_SCROLL_AFTER_MS = 320;

const lockedAspectRatio = ref<string | null>(null);

const activeAspectRatio = computed(
  () => lockedAspectRatio.value ?? readAspectRatioFromStyle(props.mediaStyle),
);

const isPortrait = computed(() =>
  isPortraitAspectRatio(activeAspectRatio.value),
);

function readAspectRatioFromStyle(s: StyleValue | undefined): string | null {
  const rec = styleRecord(s);
  const ar = rec?.aspectRatio;
  return typeof ar === 'string' && ar ? ar : null;
}

function lockAspectRatioFromVideoEl(): void {
  if (lockedAspectRatio.value) return;
  const el = videoRef.value;
  if (!el || el.videoWidth < 1 || el.videoHeight < 1) return;
  lockedAspectRatio.value = `${el.videoWidth} / ${el.videoHeight}`;
}

async function toggleExpand(event: MouseEvent) {
  const next = !expanded.value;
  expanded.value = next;
  if (!next) return;

  const root = (event.currentTarget as HTMLElement | null)?.closest(
    '.echo-video-player',
  );
  if (!(root instanceof HTMLElement)) return;

  const scrollIntoView = () => {
    root.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  };

  await nextTick();
  const reducedMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  )?.matches;
  if (reducedMotion) {
    requestAnimationFrame(() => requestAnimationFrame(scrollIntoView));
    return;
  }
  window.setTimeout(scrollIntoView, VIDEO_EXPAND_SCROLL_AFTER_MS);
}

const { state: playbackState } = useChatVideoPlayback(toRef(props, 'url'));

const videoSrc = computed(() => {
  if (!shouldLoadMedia.value) return undefined;
  if (
    playbackState.value.mode === 'hls' &&
    playbackState.value.status === 'ready'
  ) {
    return undefined;
  }
  return playbackState.value.playbackUrl;
});

const videoPreload = computed(() => (shouldLoadMedia.value ? 'auto' : 'none'));

const hasKnownLayout = computed(
  () =>
    !!(lockedAspectRatio.value ?? readAspectRatioFromStyle(props.mediaStyle)),
);

const videoCrossOrigin = computed(() =>
  echoUploadMediaCrossOrigin(playbackState.value.playbackUrl),
);

const downloadHref = computed(() => playbackState.value.sourceUrl);
const downloadName = computed(() => props.filename?.trim() || 'video');
const canDownload = computed(
  () => !!downloadHref.value && isTrustedMediaUrl(downloadHref.value),
);

const retentionStorageKey = computed(
  () =>
    props.storageKey?.trim() ||
    extractStorageKeyFromEchoMediaUrl(props.url) ||
    undefined,
);

const showUnavailable = computed(
  () => !isTrustedMediaUrl(props.url) || loadFailed.value,
);

const upgradingToHls = computed(
  () =>
    playbackState.value.status === 'pending' &&
    playbackState.value.mode === 'progressive',
);

function styleRecord(
  s: StyleValue | undefined,
): Record<string, string> | undefined {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
  return s as Record<string, string>;
}

const shellStyle = computed((): StyleValue | undefined => {
  const ar = activeAspectRatio.value;
  const maxWidth = expanded.value
    ? VIDEO_EXPANDED_MAX_WIDTH
    : VIDEO_COMPACT_MAX_WIDTH;
  const maxHeight = expanded.value
    ? VIDEO_EXPANDED_MAX_HEIGHT
    : VIDEO_COMPACT_MAX_HEIGHT;
  if (ar) {
    if (isPortrait.value) {
      return {
        aspectRatio: ar,
        width: 'auto',
        maxWidth,
        maxHeight,
      };
    }
    return {
      aspectRatio: ar,
      width: maxWidth,
      maxWidth,
    };
  }
  return {
    maxWidth,
    maxHeight,
    width: expanded.value ? VIDEO_EXPANDED_MAX_WIDTH : '100%',
  };
});

const isBoxed = computed(() => !!activeAspectRatio.value);

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
    hasRenderableFrame.value = false;
    shouldLoadMedia.value = false;
    lockedAspectRatio.value = readAspectRatioFromStyle(props.mediaStyle);
    if (revealed.value && !showUnavailable.value) {
      startMediaLoadObserver();
    }
  },
);

watch(
  () => props.mediaStyle,
  () => {
    if (!lockedAspectRatio.value) {
      lockedAspectRatio.value = readAspectRatioFromStyle(props.mediaStyle);
    }
  },
  { immediate: true },
);

const {
  isPlaying,
  controlsVisible,
  currentTime,
  duration,
  bufferedPercent,
  volume,
  muted,
  playbackRate,
  isFullscreen,
  canFullscreen,
  togglePlay: shellTogglePlay,
  seek,
  setVolume,
  toggleMute,
  setPlaybackRate,
  toggleFullscreen,
  onShellPointerActivity,
  onShellPointerLeave,
  onShellFocusIn,
  onMediaPlay,
} = useEchoMediaPlayerShell(
  videoRef,
  computed(
    () => (shellRef.value?.$el as HTMLElement | null | undefined) ?? null,
  ),
  {
    allowFullscreen: true,
  },
);

useHlsPlayback(videoRef, playbackState, {
  disabled: computed(() => showUnavailable.value || !shouldLoadMedia.value),
  progressiveSrc: videoSrc,
});

const showLoadingOverlay = computed(
  () =>
    !showUnavailable.value &&
    !hasRenderableFrame.value &&
    !hasKnownLayout.value,
);

const showLayoutSkeleton = computed(
  () =>
    !showUnavailable.value && !hasRenderableFrame.value && hasKnownLayout.value,
);

const loadingLabel = 'Loading video…';

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;
let stopLoadObserve: (() => void) | undefined;

function startMediaLoadObserver(): void {
  stopLoadObserve?.();
  if (shouldLoadMedia.value || showUnavailable.value) return;
  const el = rootRef.value;
  if (!el || typeof IntersectionObserver === 'undefined') {
    shouldLoadMedia.value = true;
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        shouldLoadMedia.value = true;
        stopLoadObserve?.();
        stopLoadObserve = undefined;
      }
    },
    { rootMargin: '240px 0px', threshold: 0.01 },
  );
  observer.observe(el);
  stopLoadObserve = () => observer.disconnect();
}

watch(
  [revealed, showUnavailable],
  () => {
    if (revealed.value && !showUnavailable.value) {
      startMediaLoadObserver();
    }
  },
  { immediate: true },
);

onMounted(() => {
  stopObserve = observeChatMediaRetentionVisible(
    rootRef.value,
    retentionStorageKey.value,
  );
  if (revealed.value && !showUnavailable.value) {
    startMediaLoadObserver();
  }
});

onUnmounted(() => {
  stopObserve?.();
  stopLoadObserve?.();
});

function onPlay(): void {
  queueChatMediaRetentionTouch(retentionStorageKey.value);
  onMediaPlay();
}

function onVideoError(): void {
  loadFailed.value = true;
  emit('error');
}

function onVideoFrameReady(): void {
  hasRenderableFrame.value = true;
  lockAspectRatioFromVideoEl();
}

function syncRenderableFrameFromElement(): void {
  const el = videoRef.value;
  if (!el || hasRenderableFrame.value) return;
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    hasRenderableFrame.value = true;
    lockAspectRatioFromVideoEl();
  }
}

watch(
  () =>
    [
      playbackState.value.playbackUrl,
      playbackState.value.mode,
      playbackState.value.status,
    ] as const,
  () => {
    queueMicrotask(() => syncRenderableFrameFromElement());
  },
);

watch(videoRef, () => syncRenderableFrameFromElement());

function ensureMediaLoaded(): void {
  if (shouldLoadMedia.value) return;
  shouldLoadMedia.value = true;
  stopLoadObserve?.();
  stopLoadObserve = undefined;
}

function togglePlay(): void {
  ensureMediaLoaded();
  shellTogglePlay();
}

function onVideoMetadata(): void {
  lockAspectRatioFromVideoEl();
}
</script>

<template>
  <div
    ref="rootRef"
    class="echo-video-player group relative transition-[max-width,max-height] duration-300 ease-out"
    :class="{
      'echo-video-player--boxed': isBoxed,
      'echo-video-player--portrait': isPortrait,
      'echo-video-player--expanded': expanded,
      'scroll-my-4': expanded,
    }"
    :style="shellStyle"
  >
    <button
      v-if="spoiler && !revealed"
      type="button"
      class="media-spoiler-btn chat-focus-ring inline-flex items-center gap-2 rounded-lg px-4 py-3 bg-overlay-heavy hover:bg-overlay-heavy text-amber-400/90 hover:text-amber-400 text-xs font-semibold uppercase tracking-wider transition-colors"
      @click="revealed = true"
    >
      <span>Spoiler</span>
      <span class="text-[10px] opacity-80">— Click to reveal</span>
    </button>

    <MediaUnavailablePanel
      v-else-if="showUnavailable"
      headline="Video unavailable"
      :href="isTrustedMediaUrl(url) ? safeImageUrl(url) : undefined"
    />

    <template v-else>
      <button
        type="button"
        class="absolute right-2 top-2 z-[3] rounded-md bg-overlay-heavy px-2 py-1 text-[11px] font-semibold text-fg shadow-md backdrop-blur-sm ring-1 ring-border transition-opacity duration-150 pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 hover:bg-overlay-heavy focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8fc]"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Smaller embed' : 'Larger embed'"
        :title="expanded ? 'Smaller embed' : 'Larger embed'"
        @click.stop="toggleExpand($event)"
      >
        {{ expanded ? 'Smaller' : 'Larger' }}
      </button>
      <EchoMediaPlayerShell
        ref="shellRef"
        variant="video"
        :controls-visible="controlsVisible"
        :is-playing="isPlaying"
        :show-center-play="true"
        @toggle-play="togglePlay()"
        @pointer-activity="onShellPointerActivity()"
        @pointer-leave="onShellPointerLeave()"
        @focus-in="onShellFocusIn()"
      >
        <div class="echo-video-player__media">
          <div
            v-if="showLayoutSkeleton"
            class="echo-video-player__layout-skeleton"
            aria-hidden="true"
          />
          <div
            v-if="showLoadingOverlay"
            class="echo-video-player__loading"
            role="status"
            aria-live="polite"
          >
            <svg
              class="echo-ios-spinner echo-video-player__spinner"
              viewBox="0 0 44 44"
              width="32"
              height="32"
              aria-hidden="true"
            >
              <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
              <circle
                class="echo-ios-spinner__arc"
                cx="22"
                cy="22"
                r="18"
                transform="rotate(-90 22 22)"
              />
            </svg>
            <span class="echo-video-player__loading-label">{{
              loadingLabel
            }}</span>
          </div>
          <video
            ref="videoRef"
            :src="videoSrc"
            :crossorigin="videoCrossOrigin ?? undefined"
            playsinline
            :preload="videoPreload"
            class="echo-video-player__video"
            :class="{
              'echo-video-player__video--hidden':
                showLoadingOverlay || showLayoutSkeleton,
            }"
            @play="onPlay"
            @playing="onVideoFrameReady"
            @error="onVideoError"
            @loadeddata="onVideoFrameReady"
            @loadedmetadata="onVideoMetadata"
            @canplay="onVideoFrameReady"
            @click="togglePlay()"
          />
          <div
            v-if="upgradingToHls && hasRenderableFrame"
            class="echo-video-player__upgrade-badge"
            aria-hidden="true"
          >
            HD
          </div>
        </div>
        <template #controls>
          <EchoMediaControls
            :is-playing="isPlaying"
            :current-time="currentTime"
            :duration="duration"
            :buffered-percent="bufferedPercent"
            :volume="volume"
            :muted="muted"
            :playback-rate="playbackRate"
            :compact="isPortrait"
            show-fullscreen
            :is-fullscreen="isFullscreen"
            :can-fullscreen="canFullscreen"
            :show-download="canDownload"
            :download-href="downloadHref"
            :download-name="downloadName"
            @toggle-play="togglePlay()"
            @seek="seek($event)"
            @set-volume="setVolume($event)"
            @toggle-mute="toggleMute()"
            @set-playback-rate="setPlaybackRate($event)"
            @toggle-fullscreen="toggleFullscreen()"
          />
        </template>
      </EchoMediaPlayerShell>
    </template>
  </div>
</template>

<style scoped lang="scss">
.echo-video-player {
  width: 100%;
  max-width: min(100%, 28rem);
  min-width: 0;
}

.echo-video-player--boxed {
  overflow: hidden;
}

.echo-video-player--boxed :deep(.echo-media-shell--video) {
  height: 100%;
  min-height: 0;
}

.echo-video-player--expanded {
  max-width: min(100%, min(92vw, 56rem));
}

.echo-video-player--boxed:not(.echo-video-player--portrait) {
  width: min(100%, 28rem);
}

.echo-video-player--boxed:not(
    .echo-video-player--portrait
  ).echo-video-player--expanded {
  width: min(100%, min(92vw, 56rem));
}

.echo-video-player--boxed.echo-video-player--portrait {
  width: auto;
  max-width: min(100%, 28rem);
}

.echo-video-player--boxed.echo-video-player--portrait.echo-video-player--expanded {
  max-width: min(100%, min(92vw, 56rem));
}

.echo-video-player--boxed.echo-video-player--portrait:not(
    .echo-video-player--expanded
  ) {
  max-height: min(80vh, 24rem);
}

.echo-video-player--boxed.echo-video-player--portrait.echo-video-player--expanded {
  max-height: min(80vh, 36rem);
}

.echo-video-player
  :deep(.echo-media-shell--video .echo-media-shell__media video) {
  max-height: min(80vh, 24rem);
}

.echo-video-player--expanded
  :deep(.echo-media-shell--video .echo-media-shell__media video) {
  max-height: min(80vh, 36rem);
}

.echo-video-player--boxed
  :deep(.echo-media-shell--video .echo-media-shell__media video),
.echo-video-player--boxed .echo-video-player__video {
  height: 100%;
  max-height: 100%;
}

.echo-video-player__media {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 6rem;
  background: rgb(0 0 0 / 0.35);
}

.echo-video-player--boxed .echo-video-player__media {
  height: 100%;
  min-height: 0;
}

.echo-video-player__video {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: min(80vh, 24rem);
  vertical-align: top;
  object-fit: contain;
}

.echo-video-player--expanded .echo-video-player__video {
  max-height: min(80vh, 36rem);
}

.echo-video-player--boxed .echo-video-player__video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.echo-video-player__video--hidden {
  opacity: 0;
  pointer-events: none;
}

.echo-video-player__layout-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    110deg,
    rgb(255 255 255 / 0.04) 8%,
    rgb(255 255 255 / 0.1) 18%,
    rgb(255 255 255 / 0.04) 33%
  );
  background-size: 200% 100%;
  animation: echo-video-layout-shimmer 1.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes echo-video-layout-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.echo-video-player__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgb(8 8 12 / 0.82);
  pointer-events: none;
}

.echo-video-player__loading-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.82);
}

.echo-video-player__spinner {
  opacity: 0.95;
}

.echo-video-player__upgrade-badge {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 2;
  border-radius: 0.25rem;
  background: rgb(0 0 0 / 0.55);
  padding: 0.125rem 0.375rem;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgb(255 255 255 / 0.75);
  pointer-events: none;
}
</style>
