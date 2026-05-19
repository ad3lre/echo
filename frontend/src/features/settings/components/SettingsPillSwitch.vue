<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  /** Accessibility label (state via aria-checked). */
  ariaLabel: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function onClick() {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    role="switch"
    class="settings-pill-switch shrink-0 outline-none"
    :class="{ 'settings-pill-switch--disabled': disabled }"
    :aria-checked="modelValue"
    :aria-disabled="disabled"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @click="onClick"
  >
    <span :class="modelValue ? 'toggle-pill toggle-pill--on' : 'toggle-pill'" />
  </button>
</template>

<style scoped lang="scss">
/* Transparent hit area + padding so the track knob is not clipped; pill provides its own fill. */
.settings-pill-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 0.85rem;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}

.settings-pill-switch--disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.settings-pill-switch:focus-visible {
  box-shadow:
    0 0 0 2px var(--bg),
    0 0 0 4px color-mix(in srgb, cornflowerblue 45%, transparent);
}

/* Width/height on .toggle-pill need a non-inline box when not inside flex row text. */
.settings-pill-switch .toggle-pill {
  display: inline-block;
  vertical-align: middle;
}
</style>
