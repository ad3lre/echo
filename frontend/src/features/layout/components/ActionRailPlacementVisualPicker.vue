<script setup lang="ts">
import type { EchoActionRailPlacementId } from '@/utils/theme';

const props = defineProps<{
  modelValue: EchoActionRailPlacementId;
}>();

const emit = defineEmits<{
  'update:modelValue': [EchoActionRailPlacementId];
}>();

const options: Array<{
  id: EchoActionRailPlacementId;
  label: string;
  desc: string;
}> = [
  {
    id: 'left',
    label: 'Left',
    desc: 'Server rail along the side — classic layout.',
  },
  {
    id: 'top',
    label: 'Top',
    desc: 'Horizontal bar across the top of the window.',
  },
];

function select(id: EchoActionRailPlacementId) {
  emit('update:modelValue', id);
}

function radioTabIndex(optId: EchoActionRailPlacementId): number {
  return props.modelValue === optId ? 0 : -1;
}

function onKeydown(ev: KeyboardEvent, index: number) {
  const group = (ev.currentTarget as HTMLElement).closest(
    '[role="radiogroup"]',
  );
  if (!group) return;
  const radios = Array.from(
    group.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ).filter((el) => el.getAttribute('aria-disabled') !== 'true');
  const pos = radios.findIndex((el) => el === ev.currentTarget);
  const move = (delta: number) => {
    if (pos < 0) return;
    const next = radios[(pos + delta + radios.length) % radios.length];
    const id = next?.dataset.railId as EchoActionRailPlacementId | undefined;
    if (id) {
      select(id);
      next.focus();
    }
  };
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
    ev.preventDefault();
    move(1);
  } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    move(-1);
  }
}
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Action bar position"
    class="grid min-w-0 grid-cols-2 gap-3 p-1 sm:gap-4"
  >
    <button
      v-for="(opt, idx) in options"
      :key="opt.id"
      type="button"
      role="radio"
      :data-rail-id="opt.id"
      :tabindex="radioTabIndex(opt.id)"
      :aria-checked="modelValue === opt.id"
      class="rail-card group flex min-w-0 flex-col rounded-xl border-2 text-left transition-[box-shadow,border-color,transform] duration-200"
      :class="[
        modelValue === opt.id
          ? 'rail-card--selected border-[color:var(--accent)]'
          : 'border-transparent hover:border-border hover:shadow-md',
      ]"
      @click="select(opt.id)"
      @keydown="onKeydown($event, idx)"
    >
      <div
        class="rail-card-preview relative min-h-[5.25rem] p-2.5"
        :class="
          opt.id === 'left'
            ? 'rail-card-preview--layout-left'
            : 'rail-card-preview--layout-top'
        "
        aria-hidden="true"
      >
        <template v-if="opt.id === 'left'">
          <div
            class="rail-card-preview__rail rail-card-preview__rail--vertical"
          >
            <span class="rail-card-preview__dot" />
            <span class="rail-card-preview__dot rail-card-preview__dot--sm" />
            <span class="rail-card-preview__dot" />
          </div>
          <div class="rail-card-preview__main">
            <span
              class="rail-card-preview__line rail-card-preview__line--long"
            />
            <span
              class="rail-card-preview__line rail-card-preview__line--mid"
            />
          </div>
        </template>
        <template v-else>
          <div class="rail-card-preview__stack-top">
            <div
              class="rail-card-preview__rail rail-card-preview__rail--horizontal"
            >
              <span class="rail-card-preview__dot" />
              <span class="rail-card-preview__dot rail-card-preview__dot--sm" />
              <span class="rail-card-preview__dot" />
            </div>
            <div
              class="rail-card-preview__main rail-card-preview__main--under-top"
            >
              <span
                class="rail-card-preview__line rail-card-preview__line--long"
              />
              <span
                class="rail-card-preview__line rail-card-preview__line--mid"
              />
            </div>
          </div>
        </template>
      </div>
      <div
        class="rail-card-caption flex flex-col items-center justify-center bg-black px-2 py-2.5 text-center"
      >
        <span
          class="text-[11px] font-bold uppercase leading-tight tracking-[0.12em] text-white"
        >
          {{ opt.label }}
        </span>
        <span
          class="mt-0.5 px-1 text-[10px] font-medium leading-snug text-white/75"
        >
          {{ opt.desc }}
        </span>
      </div>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/echoVisualSelectCard' as vsc;

.rail-card-preview {
  @include vsc.echo-visual-select-preview-clip;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border-radius: 0.625rem 0.625rem 0 0;
  background: color-mix(in srgb, var(--elevated) 88%, var(--border) 12%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 55%, transparent);
}

.rail-card-caption {
  @include vsc.echo-visual-select-caption-clip;
}

.rail-card-preview--layout-left {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0;
}

.rail-card-preview--layout-top {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.rail-card-preview__rail {
  display: flex;
  flex-shrink: 0;
  gap: 3px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface) 82%, var(--border) 18%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 45%, transparent);
}

.rail-card-preview__rail--vertical {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  padding: 4px 2px;
}

.rail-card-preview__rail--horizontal {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 3px 6px;
}

.rail-card-preview__dot {
  display: block;
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent) 72%, var(--text) 28%);
  opacity: 0.92;
}

.rail-card-preview__dot--sm {
  width: 6px;
  height: 6px;
  opacity: 0.75;
}

.rail-card-preview__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  margin-left: 8px;
}

.rail-card-preview__main--under-top {
  margin-left: 0;
  margin-top: 6px;
}

.rail-card-preview__stack-top {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  flex: 1;
}

.rail-card-preview__line {
  display: block;
  height: 0.3rem;
  max-width: 100%;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--text) 28%, var(--muted) 72%);
}

.rail-card-preview__line--long {
  width: 92%;
}

.rail-card-preview__line--mid {
  width: 64%;
  opacity: 0.85;
}

.rail-card--selected {
  @include vsc.echo-visual-select-selected-ring;
}

.rail-card:focus-visible {
  @include vsc.echo-visual-select-focus-ring;
}

.rail-card--selected:focus-visible {
  @include vsc.echo-visual-select-selected-focus-rings;
}
</style>
