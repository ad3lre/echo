<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import type { StyleValue } from 'vue';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { useChatVideoPlayback } from '@/composables/useChatVideoPlayback';
import { useHlsPlayback } from '@/composables/media/useHlsPlayback';
import { useEchoMediaPlayerShell } from '@/composables/media/useEchoMediaPlayerShell';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import { extractStorageKeyFromEchoMediaUrl } from '@shared/echoUploadStorageKey';
import MediaUnavailablePanel from '@/components/chat/MediaUnavailablePanel.vue';
import EchoMediaPlayerShell from './EchoMediaPlayerShell.vue';
import EchoMediaControls from './EchoMediaControls.vue';

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
const videoRef = ref<HTMLVideoElement | null>(null);
const shellRef = ref<InstanceType<typeof EchoMediaPlayerShell> | null>(null);

const { state: playbackState } = useChatVideoPlayback(toRef(props, 'url'));

const videoSrc = computed(() => {
  if (
    playbackState.value.mode === 'hls' &&
    playbackState.value.status === 'ready'
  ) {
    return undefined;
  }
  return playbackState.value.playbackUrl;
});

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

const showProcessing = computed(
  () =>
    playbackState.value.status === 'pending' ||
    playbackState.value.status === 'loading',
);

function styleRecord(
  s: StyleValue | undefined,
): Record<string, string> | undefined {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
  return s as Record<string, string>;
}

const shellStyle = computed((): StyleValue | undefined => {
  const rec = styleRecord(props.mediaStyle);
  const ar = rec?.aspectRatio;
  if (typeof ar === 'string' && ar) {
    return {
      aspectRatio: ar,
      width: 'min(100%, 20rem)',
      maxWidth: 'min(100%, 28rem)',
    };
  }
  return { maxWidth: 'min(100%, 28rem)' };
});

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
    hasRenderableFrame.value = false;
  },
);

const {
  isPlaying,
  isWaiting,
  controlsVisible,
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
  disabled: showUnavailable,
  progressiveSrc: videoSrc,
});

const showLoadingOverlay = computed(
  () =>
    !showUnavailable.value &&
    (showProcessing.value || isWaiting.value || !hasRenderableFrame.value),
);

const loadingLabel = computed(() =>
  showProcessing.value ? 'Processing video…' : 'Loading video…',
);

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

onMounted(() => {
  stopObserve = observeChatMediaRetentionVisible(
    rootRef.value,
    retentionStorageKey.value,
  );
});

onUnmounted(() => {
  stopObserve?.();
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
}
</script>

<template>
  <div
    ref="rootRef"
    class="echo-video-player"
    :class="{
      'echo-video-player--boxed': !!styleRecord(mediaStyle)?.aspectRatio,
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
            playsinline
            preload="auto"
            class="echo-video-player__video"
            :class="{
              'echo-video-player__video--hidden': showLoadingOverlay,
            }"
            @play="onPlay"
            @error="onVideoError"
            @loadeddata="onVideoFrameReady"
            @canplay="onVideoFrameReady"
            @click="togglePlay()"
          />
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
  width: fit-content;
  max-width: min(100%, 28rem);
}

.echo-video-player--boxed {
  width: min(100%, 28rem);
}

.echo-video-player__media {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  background: rgb(0 0 0 / 0.35);
}

.echo-video-player__video {
  display: block;
  width: auto;
  max-width: min(100%, 28rem);
  height: auto;
  max-height: min(80vh, 24rem);
  vertical-align: top;
}

.echo-video-player--boxed .echo-video-player__video {
  width: 100%;
  max-width: 100%;
  max-height: none;
  height: auto;
  object-fit: contain;
}

.echo-video-player__video--hidden {
  opacity: 0;
  pointer-events: none;
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
</style>
