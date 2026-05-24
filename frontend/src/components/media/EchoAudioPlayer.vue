<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { applyOutputSink } from '@/audio/applyOutputSink';
import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import { useEchoMediaPlayerShell } from '@/composables/media/useEchoMediaPlayerShell';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import MediaUnavailablePanel from '@/components/chat/MediaUnavailablePanel.vue';
import EchoMediaPlayerShell from './EchoMediaPlayerShell.vue';
import EchoMediaControls from './EchoMediaControls.vue';
import EchoAudioWaveform from './EchoAudioWaveform.vue';
import { useAudioWaveformPeaks } from '@/composables/media/useAudioWaveformPeaks';

const props = defineProps<{
  url: string;
  storageKey?: string;
  filename?: string;
  spoiler?: boolean;
}>();

const emit = defineEmits<{
  (e: 'error'): void;
}>();

const store = useUiAudioDevicesStore();
const revealed = ref(!props.spoiler);
const loadFailed = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);

const playUrl = computed(() => safeImageUrl(props.url));

const {
  peaks,
  loading: waveformLoading,
  failed: waveformFailed,
} = useAudioWaveformPeaks(playUrl);

const showUnavailable = computed(
  () => !isTrustedMediaUrl(props.url) || loadFailed.value,
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
  togglePlay,
  seek,
  setVolume,
  toggleMute,
  setPlaybackRate,
  onShellPointerActivity,
  onShellPointerLeave,
  onShellFocusIn,
  onMediaPlay,
} = useEchoMediaPlayerShell(audioRef, shellRef, {
  allowFullscreen: false,
});

async function syncSink(): Promise<void> {
  const el = audioRef.value;
  if (!el) return;
  await applyOutputSink(el);
}

watch(
  () => store.outputSinkId,
  () => {
    void syncSink();
  },
);

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

onMounted(() => {
  void syncSink();
  stopObserve = observeChatMediaRetentionVisible(
    rootRef.value,
    props.storageKey,
  );
});

onUnmounted(() => {
  stopObserve?.();
});

function onPlay(): void {
  queueChatMediaRetentionTouch(props.storageKey);
  onMediaPlay();
}

function onAudioError(): void {
  loadFailed.value = true;
  emit('error');
}
</script>

<template>
  <div ref="rootRef" class="echo-audio-player">
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
      headline="Audio unavailable"
      :href="isTrustedMediaUrl(url) ? playUrl : undefined"
    />

    <template v-else>
      <div ref="shellRef" class="echo-audio-player__inner">
        <EchoMediaPlayerShell
          variant="audio"
          :controls-visible="controlsVisible"
          :is-playing="isPlaying"
          :show-center-play="false"
          @toggle-play="togglePlay()"
          @pointer-activity="onShellPointerActivity()"
          @pointer-leave="onShellPointerLeave()"
          @focus-in="onShellFocusIn()"
        >
          <audio
            ref="audioRef"
            :src="playUrl"
            preload="metadata"
            @play="onPlay"
            @error="onAudioError"
          />
          <EchoAudioWaveform
            :bars="peaks?.bars ?? null"
            :loading="waveformLoading"
            :failed="waveformFailed"
            :current-time="currentTime"
            :duration="duration"
            :is-playing="isPlaying"
            @seek="seek($event)"
          />
          <template #controls>
            <EchoMediaControls
              compact
              :show-seek="false"
              :is-playing="isPlaying"
              :current-time="currentTime"
              :duration="duration"
              :buffered-percent="bufferedPercent"
              :volume="volume"
              :muted="muted"
              :playback-rate="playbackRate"
              @toggle-play="togglePlay()"
              @seek="seek($event)"
              @set-volume="setVolume($event)"
              @toggle-mute="toggleMute()"
              @set-playback-rate="setPlaybackRate($event)"
            />
          </template>
        </EchoMediaPlayerShell>
      </div>
      <a
        v-if="filename"
        :href="safeImageUrl(url)"
        class="echo-audio-player__filename"
        target="_blank"
        rel="noopener noreferrer"
        :title="filename"
      >
        {{ filename }}
      </a>
    </template>
  </div>
</template>

<style scoped lang="scss">
.echo-audio-player {
  width: 100%;
  max-width: min(520px, 100%);
}

.echo-audio-player__inner {
  width: 100%;
}

.echo-audio-player__filename {
  display: inline-flex;
  margin-top: 0.25rem;
  max-width: 100%;
  font-size: 11px;
  color: var(--fg-soft, var(--muted));
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}
</style>
