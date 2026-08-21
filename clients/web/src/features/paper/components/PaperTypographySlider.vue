<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  label: string;
  modelValue: number;
  min: number;
  max: number;
  step: number;
  display: string;
  disabled?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const localValue = ref(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    localValue.value = value;
  },
);

function onInput(ev: Event) {
  const raw = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  localValue.value = raw;
  emit('update:modelValue', raw);
}
</script>

<template>
  <div
    class="paper-typography-slider"
    :class="{ 'paper-typography-slider--compact': compact }"
    @mousedown.stop
    @pointerdown.stop
  >
    <div class="paper-typography-slider__header">
      <span class="paper-typography-slider__label">{{ label }}</span>
      <span class="paper-typography-slider__value">{{ display }}</span>
    </div>
    <input
      type="range"
      class="paper-typography-slider__input"
      :min="min"
      :max="max"
      :step="step"
      :value="localValue"
      :disabled="disabled"
      :aria-label="label"
      @mousedown.stop
      @pointerdown.stop
      @input="onInput"
    />
  </div>
</template>
