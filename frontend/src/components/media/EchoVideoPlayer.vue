<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
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
}>();

const emit = defineEmits<{
  (e: 'error'): void;
}>();

const revealed = ref(!props.spoiler);
const loadFailed = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);

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

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
  },
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
} = useEchoMediaPlayerShell(videoRef, shellRef, {
  allowFullscreen: true,
});

useHlsPlayback(videoRef, playbackState, {
  disabled: showUnavailable,
  progressiveSrc: videoSrc,
});

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
</script>

<template>
  <div ref="rootRef" class="echo-video-player">
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
      <div ref="shellRef" class="echo-video-player__wrap">
        <EchoMediaPlayerShell
          variant="video"
          :controls-visible="controlsVisible"
          :is-playing="isPlaying"
          :show-center-play="true"
          @toggle-play="togglePlay()"
          @pointer-activity="onShellPointerActivity()"
          @pointer-leave="onShellPointerLeave()"
          @focus-in="onShellFocusIn()"
        >
          <video
            ref="videoRef"
            :src="videoSrc"
            playsinline
            preload="metadata"
            class="echo-video-player__video"
            @play="onPlay"
            @error="onVideoError"
            @click="togglePlay()"
          />
          <span v-if="showProcessing" class="echo-video-player__processing">
            Processing…
          </span>
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
              @toggle-play="togglePlay()"
              @seek="seek($event)"
              @set-volume="setVolume($event)"
              @toggle-mute="toggleMute()"
              @set-playback-rate="setPlaybackRate($event)"
              @toggle-fullscreen="toggleFullscreen()"
            />
          </template>
        </EchoMediaPlayerShell>
      </div>
      <a
        class="echo-video-player__download"
        :href="downloadHref"
        :download="downloadName"
        rel="noopener noreferrer"
      >
        Download original
      </a>
    </template>
  </div>
</template>

<style scoped lang="scss">
.echo-video-player {
  width: 100%;
  max-width: min(520px, 100%);
}

.echo-video-player__wrap {
  position: relative;
}

.echo-video-player__video {
  display: block;
  width: 100%;
  max-width: 100%;
  background: rgb(0 0 0 / 0.4);
}

.echo-video-player__processing {
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
  z-index: 4;
  border-radius: 0.25rem;
  background: rgb(0 0 0 / 0.55);
  color: rgb(255 255 255 / 0.9);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.4rem;
  pointer-events: none;
  text-transform: uppercase;
}

.echo-video-player__download {
  display: inline-flex;
  margin-top: 0.25rem;
  font-size: 11px;
  color: var(--fg-soft, var(--muted));
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
