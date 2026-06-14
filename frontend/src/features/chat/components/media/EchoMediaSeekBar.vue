<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  currentTime: number;
  duration: number;
  bufferedPercent: number;
}>();

const emit = defineEmits<{
  (e: 'seek', time: number): void;
}>();

const progressPercent = computed(() => {
  if (!Number.isFinite(props.duration) || props.duration <= 0) return 0;
  return Math.min(100, (props.currentTime / props.duration) * 100);
});

const seekStyle = computed(
  () =>
    ({
      '--value': `${progressPercent.value}%`,
      '--buffered': `${props.bufferedPercent}%`,
    }) as Record<string, string>,
);

function onInput(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const pct = Number(input.value);
  if (!Number.isFinite(props.duration) || props.duration <= 0) return;
  emit('seek', (pct / 100) * props.duration);
}
</script>

<template>
  <input
    type="range"
    class="echo-media-seek chat-focus-ring"
    min="0"
    max="100"
    step="0.1"
    :value="progressPercent"
    :style="seekStyle"
    aria-label="Seek"
    @input="onInput"
  />
</template>

<style scoped lang="scss">
.echo-media-seek {
  --value: 0%;
  --buffered: 0%;
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
    color-mix(
        in srgb,
        var(--media-player-accent, var(--vc-slider-fill)) 35%,
        transparent
      )
      var(--value),
    color-mix(
        in srgb,
        var(--media-player-accent, var(--vc-slider-fill)) 35%,
        transparent
      )
      var(--buffered),
    var(--vc-slider-track) var(--buffered),
    var(--vc-slider-track) 100%
  );
}

.echo-media-seek::-webkit-slider-thumb {
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

.echo-media-seek::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vc-slider-thumb-bg);
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px var(--vc-slider-thumb-shadow);
}
</style>
