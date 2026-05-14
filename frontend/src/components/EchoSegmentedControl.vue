<script setup lang="ts">
import { computed, nextTick, useId } from 'vue';

export interface EchoSegmentedOption {
  value: string;
  label: string;
  /** Optional image URL (e.g. app icon asset). */
  iconSrc?: string;
  /** Tooltip / accesible description override. */
  title?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: EchoSegmentedOption[];
    disabled?: boolean;
    ariaLabelledby?: string;
    ariaLabel?: string;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const baseId = useId();

function segmentId(i: number) {
  return `${baseId}-opt-${i}`;
}

const selectedIndex = computed(() => {
  const i = props.options.findIndex((o) => o.value === props.modelValue);
  return i >= 0 ? i : 0;
});

function tabindexFor(i: number): number {
  if (props.disabled || props.options.length === 0) return -1;
  return i === selectedIndex.value ? 0 : -1;
}

function selectAndFocusIndex(i: number) {
  const opt = props.options[i];
  if (!opt) return;
  emit('update:modelValue', opt.value);
  nextTick(() => {
    document.getElementById(segmentId(i))?.focus();
  });
}

function onSegmentClick(value: string) {
  if (props.disabled) return;
  emit('update:modelValue', value);
}

function onSegmentKeydown(e: KeyboardEvent, i: number) {
  if (props.disabled) return;
  const n = props.options.length;
  if (n === 0) return;

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const opt = props.options[i];
    if (opt && opt.value !== props.modelValue) {
      emit('update:modelValue', opt.value);
    }
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    selectAndFocusIndex((i + 1) % n);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    selectAndFocusIndex((i - 1 + n) % n);
  } else if (e.key === 'Home') {
    e.preventDefault();
    selectAndFocusIndex(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    selectAndFocusIndex(n - 1);
  }
}
</script>

<template>
  <div
    class="echo-segmented flex w-full min-w-0 items-stretch gap-1 rounded-xl border border-border bg-glass-1 p-1"
    role="radiogroup"
    :aria-labelledby="ariaLabelledby"
    :aria-label="ariaLabel"
  >
    <button
      v-for="(opt, i) in options"
      :id="segmentId(i)"
      :key="opt.value"
      type="button"
      role="radio"
      class="echo-segmented__btn flex min-h-[2.75rem] min-w-0 flex-1 basis-0 flex-row items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-center transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
      :class="
        modelValue === opt.value
          ? 'bg-glass-3 text-white shadow-sm'
          : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
      "
      :aria-checked="modelValue === opt.value"
      :tabindex="tabindexFor(i)"
      :disabled="disabled"
      :title="opt.title ?? opt.label"
      @click="onSegmentClick(opt.value)"
      @keydown="onSegmentKeydown($event, i)"
    >
      <img
        v-if="opt.iconSrc"
        :src="opt.iconSrc"
        alt=""
        class="echo-segmented__icon h-4 w-4 shrink-0 opacity-[0.72]"
        :class="modelValue === opt.value ? 'opacity-95 invert' : 'invert'"
        aria-hidden="true"
      />
      <span
        class="max-w-full truncate text-[11px] font-semibold tracking-wide sm:text-xs"
        >{{ opt.label }}</span
      >
    </button>
  </div>
</template>
