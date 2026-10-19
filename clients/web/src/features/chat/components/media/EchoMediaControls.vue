<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { formatMediaTime } from '@/features/chat/composables/media/mediaPlayerFormat';
import {
  formatPlaybackRateLabel,
  MEDIA_PLAYBACK_RATES,
} from '@/features/chat/composables/media/mediaPlaybackRates';
import EchoMediaSeekBar from './EchoMediaSeekBar.vue';

const props = withDefaults(
  defineProps<{
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    bufferedPercent: number;
    volume: number;
    muted: boolean;
    playbackRate?: number;
    showSpeed?: boolean;
    showFullscreen?: boolean;
    isFullscreen?: boolean;
    canFullscreen?: boolean;
    showDownload?: boolean;
    downloadHref?: string;
    downloadName?: string;
    compact?: boolean;
    showSeek?: boolean;
  }>(),
  {
    playbackRate: 1,
    showSpeed: true,
    showFullscreen: false,
    isFullscreen: false,
    canFullscreen: false,
    showDownload: false,
    downloadHref: '',
    downloadName: 'video',
    compact: false,
    showSeek: true,
  },
);

const emit = defineEmits<{
  (e: 'toggle-play'): void;
  (e: 'seek', time: number): void;
  (e: 'set-volume', v: number): void;
  (e: 'toggle-mute'): void;
  (e: 'set-playback-rate', rate: number): void;
  (e: 'toggle-fullscreen'): void;
}>();

const volumeOpen = ref(false);
const speedOpen = ref(false);

const speedLabel = computed(() => formatPlaybackRateLabel(props.playbackRate));

function toggleVolumeOpen(): void {
  volumeOpen.value = !volumeOpen.value;
  if (volumeOpen.value) speedOpen.value = false;
}

function toggleSpeedOpen(): void {
  speedOpen.value = !speedOpen.value;
  if (speedOpen.value) volumeOpen.value = false;
}

function pickSpeed(rate: number): void {
  emit('set-playback-rate', rate);
  speedOpen.value = false;
}

const timeLabel = computed(
  () =>
    `${formatMediaTime(props.currentTime)} / ${formatMediaTime(props.duration)}`,
);

const volumePercent = computed(() => Math.round(props.volume * 100));

const volumeSliderStyle = computed(
  () => ({ '--value': `${volumePercent.value}%` }) as Record<string, string>,
);

function onVolumeInput(ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  emit('set-volume', v / 100);
}
</script>

<template>
  <div
    class="echo-media-controls"
    :class="{ 'echo-media-controls--compact': compact }"
    @click.stop
  >
    <EchoMediaSeekBar
      v-if="showSeek"
      class="echo-media-controls__seek"
      :current-time="currentTime"
      :duration="duration"
      :buffered-percent="bufferedPercent"
      @seek="emit('seek', $event)"
    />
    <div class="echo-media-controls__row">
      <button
        type="button"
        class="echo-media-controls__btn chat-focus-ring"
        :aria-label="
          isPlaying ? echoT('b42.media.pause') : echoT('b42.media.play')
        "
        @click="emit('toggle-play')"
      >
        <svg
          v-if="isPlaying"
          class="echo-media-controls__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
        <svg
          v-else
          class="echo-media-controls__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10.2-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14z"
          />
        </svg>
      </button>

      <span class="echo-media-controls__time" aria-live="polite">{{
        timeLabel
      }}</span>

      <div class="echo-media-controls__spacer" />

      <div v-if="showSpeed" class="echo-media-controls__speed-wrap">
        <button
          type="button"
          class="echo-media-controls__btn echo-media-controls__btn--speed chat-focus-ring"
          :aria-label="echoT('b42.media.playbackSpeed')"
          :aria-expanded="speedOpen"
          @click="toggleSpeedOpen"
        >
          <span class="echo-media-controls__speed-label">{{ speedLabel }}</span>
        </button>
        <div
          v-show="speedOpen"
          class="echo-media-controls__speed-pop"
          role="menu"
          :aria-label="echoT('b42.media.playbackSpeed')"
        >
          <button
            v-for="rate in MEDIA_PLAYBACK_RATES"
            :key="rate"
            type="button"
            role="menuitemradio"
            class="echo-media-controls__speed-option chat-focus-ring"
            :class="{
              'echo-media-controls__speed-option--active':
                Math.abs(rate - playbackRate) < 0.001,
            }"
            :aria-checked="Math.abs(rate - playbackRate) < 0.001"
            @click="pickSpeed(rate)"
          >
            {{ formatPlaybackRateLabel(rate) }}
          </button>
        </div>
      </div>

      <div class="echo-media-controls__volume-wrap">
        <button
          type="button"
          class="echo-media-controls__btn chat-focus-ring"
          :aria-label="
            muted ? echoT('b42.media.unmute') : echoT('b42.media.volume')
          "
          :aria-expanded="volumeOpen"
          @click="toggleVolumeOpen"
        >
          <img
            :src="muted ? icons.notificationsOff : icons.volumeUp"
            alt=""
            class="echo-media-controls__icon-img"
            aria-hidden="true"
          />
        </button>
        <div
          v-show="volumeOpen"
          class="echo-media-controls__volume-pop"
          role="group"
          :aria-label="echoT('b42.media.volume')"
        >
          <input
            type="range"
            class="echo-media-controls__volume-slider chat-focus-ring"
            min="0"
            max="100"
            :value="volumePercent"
            :style="volumeSliderStyle"
            :aria-label="echoT('b42.media.volumeLevel')"
            @input="onVolumeInput"
          />
        </div>
      </div>

      <a
        v-if="showDownload && downloadHref"
        :href="downloadHref"
        :download="downloadName || undefined"
        class="echo-media-controls__btn echo-media-controls__btn--download chat-focus-ring"
        :aria-label="echoT('b42.media.downloadOriginal')"
        rel="noopener noreferrer"
        @click.stop
      >
        <svg
          class="echo-media-controls__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      </a>

      <button
        v-if="showFullscreen && canFullscreen"
        type="button"
        class="echo-media-controls__btn chat-focus-ring"
        :aria-label="
          isFullscreen
            ? echoT('b42.media.exitFullscreen')
            : echoT('b42.media.fullscreen')
        "
        @click="emit('toggle-fullscreen')"
      >
        <svg
          v-if="!isFullscreen"
          class="echo-media-controls__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg
          v-else
          class="echo-media-controls__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/EchoMediaControls.scss"></style>
