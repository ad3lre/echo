<script setup lang="ts">
import { computed } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import { usePaperFormatActions } from '@/features/paper/composables/usePaperFormatActions';
import PaperColorControl from '@/features/paper/components/PaperColorControl.vue';
import PaperFontPicker from '@/features/paper/components/PaperFontPicker.vue';
import {
  PAPER_FONT_SIZE_PRESETS,
  PAPER_HIGHLIGHT_COLORS,
  PAPER_TEXT_COLORS,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  appearance: 'light' | 'dark';
  canCustomize: boolean;
  editorEditable: boolean;
}>();

const editorRef = computed(() => props.context.editor.value);
const actions = usePaperFormatActions(editorRef);

const documentFontId = computed(() =>
  paperFontIdFromFamily(props.context.documentFontFamily.value),
);

const selectionActive = computed(() => actions.hasTextSelection());

const fontSizeDisplay = computed(() => {
  if (actions.fmt.value.fontSizeMixed) return '';
  return actions.fmt.value.fontSizePx != null
    ? String(actions.fmt.value.fontSizePx)
    : '';
});
</script>

<template>
  <div class="paper-editor-tab">
    <section v-if="canCustomize" class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Document font</h4>
      <PaperFontPicker
        :model-value="documentFontId"
        :document-default-family="context.documentFontFamily.value"
        :paper-appearance="appearance"
        @update:model-value="context.onDocumentFontChange"
      />
    </section>

    <template v-if="editorEditable">
      <p v-if="!selectionActive" class="paper-editor-tab__hint">
        Select text to style it, or set the document default font above.
      </p>

      <section
        class="paper-editor-tab__block"
        :class="{ 'paper-editor-tab__block--muted': !selectionActive }"
      >
        <h4 class="paper-editor-tab__label">Selection</h4>
        <div class="paper-editor-panel__tool-row">
          <PaperFontPicker
            :model-value="actions.selectionFontId()"
            :mixed="actions.fmt.value.fontFamilyMixed"
            :document-default-family="context.documentFontFamily.value"
            :paper-appearance="appearance"
            @update:model-value="actions.setSelectionFont"
            @clear="actions.clearSelectionFont"
          />
        </div>
        <div class="paper-editor-panel__tool-row paper-editor-panel__size-row">
          <input
            type="text"
            class="paper-editor-panel__size-input"
            :readonly="actions.fmt.value.fontSizeMixed || !selectionActive"
            :placeholder="actions.fmt.value.fontSizeMixed ? 'Mixed' : 'Size'"
            :value="fontSizeDisplay"
            aria-label="Font size in pixels"
            @change="
              (e) => {
                const raw = (e.target as HTMLInputElement).value.trim();
                if (!raw) {
                  actions.setFontSizePx(null);
                  return;
                }
                const n = Number.parseInt(raw, 10);
                if (Number.isFinite(n)) actions.setFontSizePx(n);
              }
            "
          />
          <select
            class="paper-editor-panel__size-select"
            :disabled="!selectionActive"
            aria-label="Font size preset"
            @change="
              (e) =>
                actions.setFontSizePx(
                  Number((e.target as HTMLSelectElement).value),
                )
            "
          >
            <option value="" disabled selected hidden>Presets</option>
            <option v-for="px in PAPER_FONT_SIZE_PRESETS" :key="px" :value="px">
              {{ px }}px
            </option>
          </select>
        </div>
        <div class="paper-editor-panel__tool-row">
          <PaperColorControl
            label="Text"
            variant="text"
            :color="actions.fmtColors.value.textColor"
            :mixed="actions.fmtColors.value.textMixed"
            :is-default="actions.fmtColors.value.textIsDefault"
            :palette="PAPER_TEXT_COLORS"
            :paper-appearance="appearance"
            @input="actions.setTextColor"
            @clear="actions.setTextColor('')"
          />
          <PaperColorControl
            label="Highlight"
            variant="highlight"
            :color="actions.fmtColors.value.highlightColor"
            :mixed="actions.fmtColors.value.highlightMixed"
            :is-default="!actions.fmtColors.value.hasHighlight"
            :palette="PAPER_HIGHLIGHT_COLORS"
            :paper-appearance="appearance"
            @input="actions.setHighlight"
            @clear="actions.setHighlight(null)"
          />
        </div>
        <div class="paper-editor-panel__mark-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.bold === true,
            }"
            :disabled="!selectionActive"
            @click="actions.toggleMark('toggleBold')"
          >
            B
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.italic === true,
            }"
            :disabled="!selectionActive"
            @click="actions.toggleMark('toggleItalic')"
          >
            I
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.strike === true,
            }"
            :disabled="!selectionActive"
            @click="actions.toggleMark('toggleStrike')"
          >
            S
          </button>
        </div>
        <div class="paper-editor-panel__mark-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.textAlign === 'left',
            }"
            :disabled="!selectionActive"
            @click="actions.setAlign('left')"
          >
            Left
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.textAlign === 'center',
            }"
            :disabled="!selectionActive"
            @click="actions.setAlign('center')"
          >
            Center
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.textAlign === 'right',
            }"
            :disabled="!selectionActive"
            @click="actions.setAlign('right')"
          >
            Right
          </button>
        </div>
        <div class="paper-editor-panel__heading-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.heading === 'h1',
            }"
            :disabled="!selectionActive"
            @click="actions.setHeading(1)"
          >
            H1
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.heading === 'h2',
            }"
            :disabled="!selectionActive"
            @click="actions.setHeading(2)"
          >
            H2
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.heading === 'h3',
            }"
            :disabled="!selectionActive"
            @click="actions.setHeading(3)"
          >
            H3
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.heading === 'paragraph',
            }"
            :disabled="!selectionActive"
            @click="actions.setHeading(0)"
          >
            Body
          </button>
        </div>
      </section>
    </template>

    <p
      v-if="!canCustomize && !editorEditable"
      class="paper-editor-tab__hint paper-editor-tab__hint--center"
    >
      Switch to edit mode to customize typography.
    </p>
  </div>
</template>
