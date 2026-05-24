<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { formatMediaTime } from '@/composables/media/mediaPlayerFormat';
import {
  formatPlaybackRateLabel,
  MEDIA_PLAYBACK_RATES,
} from '@/composables/media/mediaPlaybackRates';
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
    compact?: boolean;
  }>(),
  {
    playbackRate: 1,
    showSpeed: true,
    showFullscreen: false,
    isFullscreen: false,
    canFullscreen: false,
    compact: false,
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
        :aria-label="isPlaying ? 'Pause' : 'Play'"
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
          aria-label="Playback speed"
          :aria-expanded="speedOpen"
          @click="toggleSpeedOpen"
        >
          <span class="echo-media-controls__speed-label">{{ speedLabel }}</span>
        </button>
        <div
          v-show="speedOpen"
          class="echo-media-controls__speed-pop"
          role="menu"
          aria-label="Playback speed"
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
          :aria-label="muted ? 'Unmute' : 'Volume'"
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
          aria-label="Volume"
        >
          <input
            type="range"
            class="echo-media-controls__volume-slider chat-focus-ring"
            min="0"
            max="100"
            :value="volumePercent"
            :style="volumeSliderStyle"
            aria-label="Volume level"
            @input="onVolumeInput"
          />
        </div>
      </div>

      <button
        v-if="showFullscreen && canFullscreen"
        type="button"
        class="echo-media-controls__btn chat-focus-ring"
        :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
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

<style scoped lang="scss">
.echo-media-controls {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.65rem 0.55rem;
  color: rgb(255 255 255 / 0.95);
}

.echo-media-controls--compact {
  padding: 0.45rem 0.55rem;
}

.echo-media-controls__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2rem;
}

.echo-media-controls__seek {
  flex: 1 1 auto;
}

.echo-media-controls__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: none;
  border-radius: 9999px;
  background: var(--vc-ctrl-bg, rgb(255 255 255 / 0.08));
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background: var(--vc-ctrl-bg-hover, rgb(255 255 255 / 0.14));
  }
}

.echo-media-controls__icon {
  width: 1rem;
  height: 1rem;
}

.echo-media-controls__icon-img {
  width: 1rem;
  height: 1rem;
  filter: brightness(0) invert(1);
  opacity: 0.95;
}

.echo-media-controls__time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgb(255 255 255 / 0.82);
  white-space: nowrap;
  user-select: none;
}

.echo-media-controls__spacer {
  flex: 1 1 auto;
  min-width: 0;
}

.echo-media-controls__btn--speed {
  min-width: 2.35rem;
  padding: 0 0.35rem;
}

.echo-media-controls__speed-label {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.echo-media-controls__speed-wrap {
  position: relative;
}

.echo-media-controls__speed-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.35rem);
  display: flex;
  flex-direction: column;
  min-width: 4.5rem;
  padding: 0.25rem;
  border-radius: 0.5rem;
  background: var(--echo-menu-bg, rgb(20 20 28 / 0.96));
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}

.echo-media-controls__speed-option {
  display: block;
  width: 100%;
  padding: 0.35rem 0.55rem;
  border: none;
  border-radius: 0.35rem;
  background: transparent;
  color: rgb(255 255 255 / 0.88);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--vc-ctrl-bg-hover, rgb(255 255 255 / 0.1));
  }
}

.echo-media-controls__speed-option--active {
  color: var(--media-player-accent, var(--vc-slider-fill));
  background: var(--vc-ctrl-bg, rgb(255 255 255 / 0.08));
}

.echo-media-controls__volume-wrap {
  position: relative;
}

.echo-media-controls__volume-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.35rem);
  width: 7rem;
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;
  background: var(--echo-menu-bg, rgb(20 20 28 / 0.96));
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}

.echo-media-controls__volume-slider {
  --value: 100%;
  width: 100%;
  height: 0.3rem;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right,
    var(--media-player-accent, var(--vc-slider-fill)) 0%,
    var(--media-player-accent, var(--vc-slider-fill)) var(--value),
    var(--vc-slider-track) var(--value),
    var(--vc-slider-track) 100%
  );
}

.echo-media-controls__volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vc-slider-thumb-bg);
  cursor: pointer;
  box-shadow: 0 1px 3px var(--vc-slider-thumb-shadow);
  border: none;
}

.echo-media-controls__volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vc-slider-thumb-bg);
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px var(--vc-slider-thumb-shadow);
}
</style>
