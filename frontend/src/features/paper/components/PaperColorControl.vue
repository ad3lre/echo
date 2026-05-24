<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  color: string | null;
  mixed?: boolean;
  isDefault?: boolean;
  /** 'text' shows underlined A; 'highlight' shows marker icon */
  variant?: 'text' | 'highlight';
}>();

const emit = defineEmits<{
  input: [value: string];
  clear: [];
}>();

const swatchStyle = computed(() => {
  if (props.mixed) {
    return {
      background: 'linear-gradient(135deg, #ef4444 0 50%, #3b82f6 50% 100%)',
    };
  }
  if (props.isDefault || !props.color) {
    return {
      background: 'var(--paper-surface-fg)',
      color: 'var(--paper-surface-bg)',
    };
  }
  return { background: props.color };
});

function onInput(ev: Event) {
  emit('input', (ev.target as HTMLInputElement).value);
}

function onContextMenu(ev: MouseEvent) {
  if (props.mixed) return;
  if (!props.isDefault && props.color) {
    ev.preventDefault();
    emit('clear');
  }
}
</script>

<template>
  <label
    class="paper-color-control"
    :title="
      mixed
        ? `${label}: mixed`
        : isDefault
          ? `${label}: default (right-click to clear)`
          : `${label}: ${color ?? ''} (right-click to clear)`
    "
    @mousedown.prevent
    @contextmenu="onContextMenu"
  >
    <span class="sr-only">{{ label }}</span>
    <span
      class="paper-color-swatch"
      :class="{ 'paper-color-swatch--mixed': mixed }"
      :style="swatchStyle"
      aria-hidden="true"
    >
      <span
        v-if="isDefault && !mixed && (variant ?? 'text') === 'text'"
        class="paper-color-swatch-glyph paper-color-swatch-glyph--text"
        >A</span
      >
      <svg
        v-else-if="isDefault && !mixed && variant === 'highlight'"
        class="paper-color-swatch-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      <span v-else-if="mixed" class="paper-color-swatch-glyph">…</span>
    </span>
    <input
      type="color"
      class="paper-color-input"
      :value="color && !mixed ? color : '#111111'"
      :disabled="mixed"
      @input="onInput"
    />
  </label>
</template>

<style scoped>
.paper-color-control {
  position: relative;
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.paper-color-swatch {
  display: flex;
  height: 1.25rem;
  width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid var(--border);
  font-size: 0.625rem;
  font-weight: 700;
}

.paper-color-swatch-glyph--text {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-color-swatch-icon {
  width: 0.75rem;
  height: 0.75rem;
}

.paper-color-swatch--mixed {
  border-style: dashed;
}

.paper-color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.paper-color-input:disabled {
  cursor: not-allowed;
}
</style>
