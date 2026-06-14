<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WaveformBar } from '@/composables/media/audioWaveformPeaks';

const props = withDefaults(
  defineProps<{
    bars?: WaveformBar[] | null;
    loading?: boolean;
    failed?: boolean;
    currentTime?: number;
    duration?: number;
    isPlaying?: boolean;
  }>(),
  {
    bars: null,
    loading: false,
    failed: false,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
  },
);

const emit = defineEmits<{
  (e: 'seek', time: number): void;
}>();

const trackRef = ref<HTMLElement | null>(null);
const scrubbing = ref(false);

const progressRatio = computed(() => {
  const d = props.duration;
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.min(1, Math.max(0, props.currentTime / d));
});

const trackStyle = computed(
  () =>
    ({
      '--progress-ratio': String(progressRatio.value),
    }) as Record<string, string>,
);

const displayBars = computed((): WaveformBar[] => {
  if (props.bars?.length) return props.bars;
  return Array.from({ length: 48 }, (_, i) => ({
    peak: 0.12 + ((i * 11) % 55) / 100,
    tint: (i % 17) / 16,
  }));
});

const isPlaceholder = computed(
  () => props.failed || (!props.bars?.length && !props.loading),
);

function barPlayed(index: number): boolean {
  const threshold = (index + 0.5) / displayBars.value.length;
  return threshold <= progressRatio.value;
}

function seekFromClientX(clientX: number): void {
  const track = trackRef.value;
  const d = props.duration;
  if (!track || !Number.isFinite(d) || d <= 0) return;
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  emit('seek', ratio * d);
}

function onPointerDown(ev: PointerEvent): void {
  if (ev.button !== 0) return;
  scrubbing.value = true;
  trackRef.value?.setPointerCapture(ev.pointerId);
  seekFromClientX(ev.clientX);
}

function onPointerMove(ev: PointerEvent): void {
  if (!scrubbing.value) return;
  seekFromClientX(ev.clientX);
}

function onPointerUp(ev: PointerEvent): void {
  if (!scrubbing.value) return;
  scrubbing.value = false;
  if (trackRef.value?.hasPointerCapture(ev.pointerId)) {
    trackRef.value.releasePointerCapture(ev.pointerId);
  }
}

function barStyle(bar: WaveformBar): Record<string, string> {
  return {
    '--peak': String(bar.peak),
    '--tint': String(bar.tint),
  };
}
</script>

<template>
  <div
    ref="trackRef"
    class="echo-audio-waveform chat-focus-ring"
    :class="{
      'echo-audio-waveform--loading': loading,
      'echo-audio-waveform--placeholder': isPlaceholder,
      'echo-audio-waveform--playing': isPlaying,
      'echo-audio-waveform--scrubbing': scrubbing,
    }"
    role="slider"
    aria-label="Audio waveform"
    :aria-valuemin="0"
    :aria-valuemax="duration"
    :aria-valuenow="currentTime"
    tabindex="0"
    :style="trackStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown.left.prevent="emit('seek', Math.max(0, currentTime - 5))"
    @keydown.right.prevent="emit('seek', Math.min(duration, currentTime + 5))"
  >
    <div class="echo-audio-waveform__center-line" aria-hidden="true" />
    <div class="echo-audio-waveform__bars" aria-hidden="true">
      <div
        v-for="(bar, i) in displayBars"
        :key="i"
        class="echo-audio-waveform__bar"
        :class="{ 'echo-audio-waveform__bar--played': barPlayed(i) }"
        :style="barStyle(bar)"
      />
    </div>
    <div class="echo-audio-waveform__playhead" aria-hidden="true" />
    <div
      v-if="loading"
      class="echo-audio-waveform__shimmer"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped lang="scss">
.echo-audio-waveform {
  position: relative;
  height: 3.75rem;
  padding: 0.45rem 0.65rem 0.35rem;
  cursor: pointer;
  touch-action: none;
  outline: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
    border-radius: 0.35rem;
  }
}

.echo-audio-waveform__center-line {
  position: absolute;
  left: 0.65rem;
  right: 0.65rem;
  top: 50%;
  height: 1px;
  background: color-mix(in srgb, var(--border) 70%, transparent);
  pointer-events: none;
  z-index: 1;
}

.echo-audio-waveform__bars {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: stretch;
  gap: 1px;
  height: 100%;
}

.echo-audio-waveform__bar {
  flex: 1 1 0;
  min-width: 2px;
  max-width: 4px;
  height: calc(var(--peak, 0.35) * 100%);
  border-radius: 9999px;
  background: linear-gradient(
    180deg,
    color-mix(
        in srgb,
        var(--media-player-wave-treble, var(--accent)) calc(var(--tint) * 100%),
        var(--media-player-wave-bass, var(--accent))
      )
      0%,
    var(--media-player-accent, var(--accent)) 50%,
    color-mix(
        in srgb,
        var(--media-player-wave-bass, var(--accent))
          calc((1 - var(--tint)) * 100%),
        var(--media-player-wave-treble, var(--accent))
      )
      100%
  );
  opacity: 0.34;
  transition: opacity 0.12s ease;
}

.echo-audio-waveform__bar--played {
  opacity: 0.92;
}

.echo-audio-waveform--playing .echo-audio-waveform__bar--played {
  filter: saturate(1.08);
}

.echo-audio-waveform--scrubbing .echo-audio-waveform__bar--played {
  opacity: 1;
}

.echo-audio-waveform__playhead {
  position: absolute;
  top: 0.35rem;
  bottom: 0.25rem;
  left: calc(0.65rem + (100% - 1.3rem) * var(--progress-ratio, 0));
  z-index: 3;
  width: 2px;
  margin-left: -1px;
  border-radius: 9999px;
  background: var(--media-player-accent, var(--accent));
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.echo-audio-waveform--playing .echo-audio-waveform__playhead,
.echo-audio-waveform--scrubbing .echo-audio-waveform__playhead,
.echo-audio-waveform:focus-visible .echo-audio-waveform__playhead {
  opacity: 1;
}

.echo-audio-waveform--placeholder .echo-audio-waveform__bar {
  opacity: 0.22;
}

.echo-audio-waveform--placeholder .echo-audio-waveform__bar--played {
  opacity: 0.55;
}

.echo-audio-waveform__shimmer {
  position: absolute;
  inset: 0.45rem 0.65rem;
  z-index: 4;
  border-radius: 0.35rem;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--accent) 12%, transparent) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: echo-audio-waveform-shimmer 1.4s ease-in-out infinite;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .echo-audio-waveform__shimmer {
    animation: none;
    opacity: 0.35;
  }
}

@keyframes echo-audio-waveform-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
