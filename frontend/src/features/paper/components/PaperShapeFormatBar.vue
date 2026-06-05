<script setup lang="ts">
import { computed } from 'vue';
import type { Editor } from '@tiptap/core';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import type { PaperShapeAlign } from '@/features/paper/editor/paperShapeExtension';
import {
  PAPER_SHAPE_SIZE_PRESETS,
  usePaperShapeActions,
} from '@/features/paper/composables/usePaperShapeActions';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';
import PaperFormatPresetMenu from '@/features/paper/components/PaperFormatPresetMenu.vue';

const props = defineProps<{
  editor: Editor | null;
  visible?: boolean;
  pageLayout?: PaperPageLayout;
  paperAppearance?: PaperAppearanceMode;
}>();

const editorRef = computed(() => props.editor);
const shapeActions = usePaperShapeActions(editorRef);

const show = computed(
  () =>
    props.visible !== false && !!props.editor && shapeActions.isShapeSelected(),
);

const sizeOptions = computed<EchoDropdownOption[]>(() => {
  const { width, height } = shapeActions.selectedShapeSizePx();
  const custom =
    !PAPER_SHAPE_SIZE_PRESETS.some((p) => p.px === width) || width !== height
      ? [{ label: `${width}×${height}`, value: 'custom' }]
      : [];
  return [
    ...PAPER_SHAPE_SIZE_PRESETS.map((p) => ({
      label: p.label,
      value: String(p.px),
    })),
    ...custom,
  ];
});

const currentSizeValue = computed(() => {
  const { width } = shapeActions.selectedShapeSizePx();
  const hit = PAPER_SHAPE_SIZE_PRESETS.find((p) => p.px === width);
  return hit ? String(hit.px) : 'custom';
});

const currentAlign = computed(() => shapeActions.selectedShapeAlign());

function setSize(value: string) {
  if (value === 'custom') return;
  shapeActions.setShapeSizePx(Number(value));
}

function setAlign(align: PaperShapeAlign) {
  shapeActions.setShapeAlign(align);
}

const barStyle = computed(() => {
  const layout = props.pageLayout;
  if (!layout || layout.width <= 0) {
    return { left: '50%', transform: 'translateX(-50%)' };
  }
  return {
    left: `${layout.viewportCenterX}px`,
    transform: 'translateX(-50%)',
  };
});
</script>

<template>
  <div
    v-if="show"
    class="paper-format-bar paper-shape-format-bar pointer-events-none fixed bottom-20 z-40"
    :style="barStyle"
    role="toolbar"
    aria-label="Shape formatting"
  >
    <div
      class="pointer-events-auto flex items-center gap-1 overflow-x-auto overflow-y-visible rounded-full border border-border px-2 py-1 shadow-lg backdrop-blur-md"
      style="background: var(--paper-format-bar-bg)"
    >
      <PaperFormatPresetMenu
        :model-value="currentSizeValue"
        :options="sizeOptions"
        :paper-appearance="paperAppearance ?? 'light'"
        trigger-mode="label"
        placement="above"
        title="Shape size"
        @update:model-value="setSize"
      />

      <span class="paper-format-divider" aria-hidden="true" />

      <div class="paper-shape-align-group" role="group" aria-label="Position">
        <button
          type="button"
          class="paper-format-btn"
          :class="{ 'paper-format-btn--active': currentAlign === 'left' }"
          title="Align left"
          aria-label="Align left"
          @mousedown.prevent="setAlign('left')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="4" y1="18" x2="18" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          class="paper-format-btn"
          :class="{ 'paper-format-btn--active': currentAlign === 'center' }"
          title="Align center"
          aria-label="Align center"
          @mousedown.prevent="setAlign('center')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="5" y1="18" x2="19" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          class="paper-format-btn"
          :class="{ 'paper-format-btn--active': currentAlign === 'right' }"
          title="Align right"
          aria-label="Align right"
          @mousedown.prevent="setAlign('right')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="10" y1="12" x2="20" y2="12" />
            <line x1="6" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-shape-format-bar {
  bottom: 5rem;
}

.paper-shape-align-group {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
}

.paper-format-btn {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: var(--muted);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.paper-format-btn:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.paper-format-btn--active {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
}

.paper-format-divider {
  width: 1px;
  height: 1.35rem;
  margin: 0 0.15rem;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--border) 70%, transparent);
}
</style>
