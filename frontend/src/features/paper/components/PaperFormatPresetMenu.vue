<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';

export type PaperFormatPresetOption = {
  label: string;
  value: string;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: PaperFormatPresetOption[];
    paperAppearance?: PaperAppearanceMode;
    disabled?: boolean;
    title?: string;
    /** Chevron-only trigger beside an input, or label showing the current preset. */
    triggerMode?: 'chevron' | 'label';
    placement?: 'above' | 'below';
    /** Align the menu to the parent row (e.g. size input + chevron) instead of the trigger only. */
    positionTarget?: 'self' | 'parent';
  }>(),
  {
    triggerMode: 'chevron',
    placement: 'above',
    positionTarget: 'self',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string> | null>(null);
const panelId = useId();

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit?.label ?? props.options[0]?.label ?? 'Presets';
});

const triggerTitle = computed(
  () =>
    props.title ??
    (props.triggerMode === 'label' ? 'Size' : 'Font size presets'),
);

function getAnchorEl(): HTMLElement | null {
  const root = rootRef.value;
  if (!root) return null;
  if (props.positionTarget === 'parent' && root.parentElement) {
    return root.parentElement;
  }
  return root;
}

function clampCenterX(centerX: number, panelWidth: number): number {
  const half = panelWidth / 2;
  const minCenter = 8 + half;
  const maxCenter = window.innerWidth - 8 - half;
  return Math.min(Math.max(centerX, minCenter), maxCenter);
}

function applyPanelPosition(
  rect: DOMRect,
  centerX: number,
  minWidth: number,
  panelWidth: number,
) {
  const left = clampCenterX(centerX, panelWidth);
  const base: Record<string, string> = {
    position: 'fixed',
    left: `${left}px`,
    transform: 'translateX(-50%)',
    minWidth: `${minWidth}px`,
    zIndex: '450',
  };
  if (props.placement === 'below') {
    panelStyle.value = {
      ...base,
      top: `${rect.bottom + 6}px`,
    };
    return;
  }
  panelStyle.value = {
    ...base,
    bottom: `${window.innerHeight - rect.top + 6}px`,
  };
}

async function positionPanel() {
  await nextTick();
  const anchor = getAnchorEl();
  if (!anchor) {
    panelStyle.value = null;
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const minWidth = Math.max(rect.width, 72);
  const centerX = rect.left + rect.width / 2;

  applyPanelPosition(rect, centerX, minWidth, minWidth);
  await nextTick();

  const panel = document.getElementById(panelId);
  if (!panel) return;
  const measured = panel.getBoundingClientRect().width;
  if (Math.abs(measured - minWidth) > 1) {
    applyPanelPosition(rect, centerX, minWidth, measured);
  }
}

function close() {
  open.value = false;
}

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
}

function pick(value: string) {
  emit('update:modelValue', value);
  close();
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!open.value) return;
  const root = rootRef.value;
  const target = ev.target as Node;
  if (root?.contains(target)) return;
  const panel = document.getElementById(panelId);
  if (panel?.contains(target)) return;
  close();
}

function onKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && open.value) close();
}

watch(open, (isOpen) => {
  if (isOpen) {
    void positionPanel();
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
    panelStyle.value = null;
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', positionPanel);
  window.removeEventListener('scroll', positionPanel, true);
});
</script>

<template>
  <div ref="rootRef" class="paper-format-preset-menu-root">
    <button
      type="button"
      class="paper-format-preset-trigger"
      :class="{
        'paper-format-preset-trigger--chevron': triggerMode === 'chevron',
        'paper-format-preset-trigger--label': triggerMode === 'label',
      }"
      :title="triggerTitle"
      :aria-label="triggerTitle"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="disabled"
      @mousedown.prevent
      @click="toggle"
    >
      <span
        v-if="triggerMode === 'label'"
        class="paper-format-preset-trigger__label"
      >
        {{ selectedLabel }}
      </span>
      <svg
        class="paper-format-preset-trigger__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open && panelStyle"
        :id="panelId"
        class="paper-format-preset-menu paper-format-preset-menu--teleport paper-teleport-surface"
        :data-paper-appearance="paperAppearance ?? 'light'"
        :style="panelStyle"
        role="listbox"
        :aria-label="triggerTitle"
        @mousedown.prevent
      >
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="paper-format-preset-option"
          :class="{
            'paper-format-preset-option--active': modelValue === opt.value,
          }"
          role="option"
          :aria-selected="modelValue === opt.value"
          @mousedown.prevent.stop="pick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.paper-format-preset-menu-root {
  display: inline-flex;
  flex-shrink: 0;
}

.paper-format-preset-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  border: none;
  background: transparent;
  color: var(--paper-surface-muted, var(--muted));
  cursor: pointer;
  font-family: inherit;
  -webkit-appearance: none;
  appearance: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.paper-format-preset-trigger:hover:not(:disabled) {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.paper-format-preset-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.paper-format-preset-trigger:focus {
  outline: none;
}

.paper-format-preset-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.paper-format-preset-trigger--chevron {
  width: 1.35rem;
  height: 2rem;
  border-radius: 0;
}

.paper-format-preset-trigger--label {
  height: 2rem;
  padding: 0 0.45rem;
  border-radius: 8px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text);
}

.paper-format-preset-trigger__label {
  max-width: 4.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-format-preset-trigger__icon {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
  opacity: 0.72;
}

.paper-format-preset-menu--teleport {
  overflow-y: auto;
  max-height: min(14rem, 45vh);
  width: max-content;
  max-width: min(12rem, calc(100vw - 1rem));
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--elevated);
  color: var(--text);
  padding: 0.2rem 0;
  box-shadow: var(--paper-dropdown-shadow);
}

.paper-format-preset-option {
  display: block;
  width: 100%;
  padding: 0.35rem 0.65rem;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
  color: var(--text);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: background 0.12s ease;
}

.paper-format-preset-option:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.paper-format-preset-option--active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
</style>
