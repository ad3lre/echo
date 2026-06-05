<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import { usePaperFormatActions } from '@/features/paper/composables/usePaperFormatActions';
import { usePaperShapeActions } from '@/features/paper/composables/usePaperShapeActions';
import {
  usePaperColorTarget,
  type PaperColorTarget,
} from '@/features/paper/composables/usePaperColorTarget';
import PaperEditorCanvasColorSection from '@/features/paper/components/PaperEditorCanvasColorSection.vue';
import {
  PAPER_HIGHLIGHT_COLORS,
  PAPER_OBJECT_COLORS,
  PAPER_TEXT_COLORS,
} from '@/features/paper/editor/paperTypography';
import { extractPaperDocumentColors } from '@/features/paper/editor/extractPaperDocumentColors';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';
import PaperFormatPresetMenu from '@/features/paper/components/PaperFormatPresetMenu.vue';
import { PAPER_SHAPE_SIZE_PRESETS } from '@/features/paper/composables/usePaperShapeActions';
import type {
  PaperShapeAlign,
  PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  appearance: PaperAppearanceMode;
  editorEditable: boolean;
}>();

const editorRef = computed(() => props.context.editor.value);
const actions = usePaperFormatActions(editorRef);
const shapeActions = usePaperShapeActions(editorRef);
const { activeColorTarget, setColorTarget } = usePaperColorTarget();

const colorTargets: { id: PaperColorTarget; label: string; hint: string }[] = [
  { id: 'text', label: 'Text', hint: 'Applies to selected text' },
  { id: 'highlight', label: 'Highlight', hint: 'Applies to text background' },
  {
    id: 'object',
    label: 'Objects',
    hint: 'Applies to shapes you add or select',
  },
];

const shapeTools: { id: PaperShapeKind; label: string }[] = [
  { id: 'rectangle', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'line', label: 'Line' },
];

const selectionActive = computed(
  () => props.editorEditable && actions.hasTextSelection(),
);

const shapeSelected = computed(() => shapeActions.isShapeSelected());

const documentColors = computed(() =>
  extractPaperDocumentColors(props.context.contentJson.value),
);

const textQuickPalette = computed(() =>
  PAPER_TEXT_COLORS.filter((s) => s.value.trim().length > 0),
);

const objectDisplayColor = computed(() => {
  if (shapeSelected.value) {
    return (
      shapeActions.selectedShapeFill() ?? shapeActions.pendingObjectColor.value
    );
  }
  return shapeActions.pendingObjectColor.value;
});

const targetHint = computed(() => {
  const hit = colorTargets.find((t) => t.id === activeColorTarget.value);
  if (!hit) return '';
  if (activeColorTarget.value === 'object' && shapeSelected.value) {
    return 'Selected shape — pick a fill color';
  }
  if (activeColorTarget.value === 'object') {
    return 'Pick a color, then add a shape below';
  }
  if (activeColorTarget.value === 'text' && !selectionActive.value) {
    return 'Select text to apply a text color';
  }
  if (activeColorTarget.value === 'highlight' && !selectionActive.value) {
    return 'Select text to apply a highlight';
  }
  return hit.hint;
});

function onEditorSelectionUpdate() {
  const ed = editorRef.value;
  if (!ed) return;
  if (ed.isActive('paperShape')) {
    setColorTarget('object');
  }
}

watch(
  editorRef,
  (ed, prev) => {
    prev?.off('selectionUpdate', onEditorSelectionUpdate);
    ed?.on('selectionUpdate', onEditorSelectionUpdate);
  },
  { immediate: true },
);

onUnmounted(() => {
  editorRef.value?.off('selectionUpdate', onEditorSelectionUpdate);
});

function insertShape(shape: PaperShapeKind) {
  shapeActions.insertShape(shape);
}

const shapeSizeOptions: EchoDropdownOption[] = PAPER_SHAPE_SIZE_PRESETS.map(
  (p) => ({ label: p.label, value: String(p.px) }),
);

const shapeAlignOptions: EchoDropdownOption[] = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const currentShapeSize = computed(() => {
  const { width } = shapeActions.selectedShapeSizePx();
  const hit = PAPER_SHAPE_SIZE_PRESETS.find((p) => p.px === width);
  return hit ? String(hit.px) : String(width);
});
</script>

<template>
  <div class="paper-editor-tab paper-colors-tab">
    <p
      v-if="!editorEditable"
      class="paper-editor-tab__hint paper-editor-tab__hint--center"
    >
      Switch to edit mode to style colors.
    </p>

    <template v-else>
      <div
        class="paper-colors-tab__targets"
        role="tablist"
        aria-label="Color target"
      >
        <button
          v-for="target in colorTargets"
          :id="`paper-color-target-${target.id}`"
          :key="target.id"
          type="button"
          role="tab"
          class="paper-colors-tab__target"
          :class="{
            'paper-colors-tab__target--active': activeColorTarget === target.id,
          }"
          :aria-selected="activeColorTarget === target.id"
          @mousedown.prevent.stop="setColorTarget(target.id)"
        >
          {{ target.label }}
        </button>
      </div>

      <p class="paper-colors-tab__target-hint">{{ targetHint }}</p>

      <div
        v-show="activeColorTarget === 'text'"
        role="tabpanel"
        aria-labelledby="paper-color-target-text"
        :class="{ 'paper-colors-tab__panel--muted': !selectionActive }"
      >
        <PaperEditorCanvasColorSection
          label=""
          kind="text"
          :color="actions.fmtColors.value.textColor"
          :mixed="actions.fmtColors.value.textMixed"
          :is-default="actions.fmtColors.value.textIsDefault"
          :disabled="!selectionActive"
          :quick-palette="textQuickPalette"
          :document-palette="documentColors.text"
          :paper-appearance="appearance"
          @pick="actions.setTextColor"
          @clear="actions.setTextColor('')"
        />
      </div>

      <div
        v-show="activeColorTarget === 'highlight'"
        role="tabpanel"
        aria-labelledby="paper-color-target-highlight"
        :class="{ 'paper-colors-tab__panel--muted': !selectionActive }"
      >
        <PaperEditorCanvasColorSection
          label=""
          kind="highlight"
          :color="actions.fmtColors.value.highlightColor"
          :mixed="actions.fmtColors.value.highlightMixed"
          :is-default="!actions.fmtColors.value.hasHighlight"
          :disabled="!selectionActive"
          :quick-palette="PAPER_HIGHLIGHT_COLORS"
          :document-palette="documentColors.highlight"
          :paper-appearance="appearance"
          @pick="actions.setHighlight"
          @clear="actions.setHighlight(null)"
        />
      </div>

      <div
        v-show="activeColorTarget === 'object'"
        role="tabpanel"
        aria-labelledby="paper-color-target-object"
      >
        <PaperEditorCanvasColorSection
          label=""
          kind="object"
          :color="objectDisplayColor"
          :quick-palette="PAPER_OBJECT_COLORS"
          :document-palette="documentColors.object"
          :paper-appearance="appearance"
          @pick="shapeActions.setObjectFill"
          @clear="shapeActions.clearObjectFill"
        />

        <section v-if="shapeSelected" class="paper-colors-tab__shape-controls">
          <div
            class="paper-editor-panel__tool-row paper-editor-panel__size-row"
          >
            <span class="paper-editor-panel__control-label">Size</span>
            <PaperFormatPresetMenu
              :model-value="currentShapeSize"
              :options="shapeSizeOptions"
              :paper-appearance="appearance"
              trigger-mode="label"
              placement="below"
              title="Shape size"
              @update:model-value="
                (v) => shapeActions.setShapeSizePx(Number(v))
              "
            />
          </div>
          <div class="paper-editor-panel__tool-row">
            <span class="paper-editor-panel__control-label">Position</span>
            <EchoDropdown
              :model-value="shapeActions.selectedShapeAlign()"
              :options="shapeAlignOptions"
              label="Position"
              compact
              @update:model-value="
                (v) => shapeActions.setShapeAlign(v as PaperShapeAlign)
              "
            />
          </div>
        </section>

        <section class="paper-colors-tab__shapes">
          <h4 class="paper-editor-tab__label">
            {{ shapeSelected ? 'Replace shape' : 'Add shape' }}
          </h4>
          <div class="paper-colors-tab__shape-grid">
            <button
              v-for="tool in shapeTools"
              :key="tool.id"
              type="button"
              class="paper-colors-tab__shape-btn"
              :title="`Insert ${tool.label.toLowerCase()}`"
              :aria-label="`Insert ${tool.label.toLowerCase()}`"
              @mousedown.prevent.stop="insertShape(tool.id)"
            >
              <span
                class="paper-colors-tab__shape-preview"
                :class="`paper-colors-tab__shape-preview--${tool.id}`"
                :style="{ backgroundColor: objectDisplayColor }"
                aria-hidden="true"
              />
              <span class="paper-colors-tab__shape-label">{{
                tool.label
              }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.paper-colors-tab__targets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  padding: 0.2rem;
  border-radius: 0.625rem;
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.paper-colors-tab__target {
  padding: 0.45rem 0.35rem;
  border-radius: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--muted);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.paper-colors-tab__target:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.paper-colors-tab__target--active {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
}

.paper-colors-tab__target-hint {
  margin: 0 0 0.65rem;
  font-size: 0.6875rem;
  line-height: 1.35;
  color: var(--muted);
}

.paper-colors-tab__panel--muted {
  opacity: 0.55;
  pointer-events: none;
}

.paper-colors-tab__shape-controls {
  margin-bottom: 0.75rem;
}

.paper-colors-tab__shapes {
  margin-top: 0.25rem;
}
</style>
