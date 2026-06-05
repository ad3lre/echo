<script setup lang="ts">
import { computed } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import { usePaperFormatActions } from '@/features/paper/composables/usePaperFormatActions';
import PaperColorControl from '@/features/paper/components/PaperColorControl.vue';
import PaperFontPicker from '@/features/paper/components/PaperFontPicker.vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';
import {
  PAPER_FONT_SIZE_PRESETS,
  PAPER_HIGHLIGHT_COLORS,
  PAPER_TEXT_COLORS,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  appearance: 'light' | 'dark' | 'amber';
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

const fontSizePresetOptions = computed<EchoDropdownOption[]>(() =>
  PAPER_FONT_SIZE_PRESETS.map((px) => ({
    label: `${px}px`,
    value: String(px),
  })),
);

const letterSpacingPresetOptions: EchoDropdownOption[] = [
  { label: 'Normal', value: '' },
  { label: '0.5px', value: '0.5px' },
  { label: '1px', value: '1px' },
  { label: '2px', value: '2px' },
  { label: '4px', value: '4px' },
];

const lineHeightPresetOptions: EchoDropdownOption[] = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.35', value: '1.35' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
];

const textOutlinePresetOptions: EchoDropdownOption[] = [
  { label: 'Off', value: '' },
  { label: 'Thin', value: 'thin' },
  { label: 'Medium', value: 'medium' },
];

function onFontSizePresetSelect(value: string) {
  const n = Number.parseInt(value, 10);
  if (Number.isFinite(n)) actions.setFontSizePx(n);
}

function cycleAlignInPanel() {
  const current = actions.fmt.value.textAlign;
  const order: Array<'left' | 'center' | 'right' | 'justify'> = [
    'left',
    'center',
    'right',
    'justify',
  ];
  const idx = order.indexOf(current === 'mixed' ? 'left' : current);
  const next = order[(idx + 1) % order.length];
  actions.setAlign(next);
}

function alignDisplayLabel(align: string): string {
  if (align === 'mixed') return 'Mixed';
  return align.charAt(0).toUpperCase() + align.slice(1);
}

function setLetterSpacing(value: string) {
  actions.setLetterSpacing(value || null);
}

function setLineHeight(value: string) {
  actions.setLineHeight(value || null);
}

function setTextOutline(preset: string) {
  if (!preset) {
    actions.setTextOutline(null);
    return;
  }
  const width = preset === 'thin' ? '1px' : '2px';
  actions.setTextOutline(width);
}

function runIndent() {
  actions.indent();
}

function runOutdent() {
  actions.outdent();
}
</script>

<template>
  <div class="paper-editor-tab">
    <section v-if="canCustomize" class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Document font</h4>
      <PaperFontPicker
        :model-value="documentFontId"
        :document-default-family="context.documentFontFamily.value"
        :paper-appearance="appearance"
        variant="panel"
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
            variant="panel"
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
          <EchoDropdown
            :model-value="''"
            :options="fontSizePresetOptions"
            label="Presets"
            :disabled="!selectionActive"
            compact
            menu-match-trigger-width
            @update:model-value="onFontSizePresetSelect"
          />
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
            class="paper-editor-panel__chip paper-editor-panel__chip--wide"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.textAlign !== 'left',
            }"
            :disabled="!selectionActive"
            :title="`Alignment: ${actions.fmt.value.textAlign} (click to cycle)`"
            @click="cycleAlignInPanel"
          >
            Align: {{ alignDisplayLabel(actions.fmt.value.textAlign) }}
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

        <div class="paper-editor-panel__mark-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.bulletList === true,
            }"
            :disabled="!selectionActive"
            @click="actions.toggleList('toggleBulletList')"
          >
            Bullet
          </button>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :class="{
              'paper-editor-panel__chip--active':
                actions.fmt.value.orderedList === true,
            }"
            :disabled="!selectionActive"
            @click="actions.toggleList('toggleOrderedList')"
          >
            Numbered
          </button>
        </div>

        <div class="paper-editor-panel__tool-row">
          <button
            type="button"
            class="paper-editor-panel__asset-btn paper-editor-panel__asset-btn--ghost"
            :disabled="!selectionActive"
            @click="actions.insertHorizontalRule()"
          >
            Insert horizontal rule
          </button>
        </div>

        <div class="paper-editor-panel__divider" />

        <h4 class="paper-editor-tab__label">Spacing</h4>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Letter</span>
          <div class="paper-editor-panel__chip-row">
            <button
              v-for="opt in letterSpacingPresetOptions"
              :key="opt.value"
              type="button"
              class="paper-editor-panel__chip"
              :class="{
                'paper-editor-panel__chip--active':
                  (!opt.value && !actions.fmt.value.letterSpacing) ||
                  actions.fmt.value.letterSpacing === opt.value,
              }"
              :disabled="!selectionActive"
              @click="setLetterSpacing(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Line</span>
          <div class="paper-editor-panel__chip-row">
            <button
              v-for="opt in lineHeightPresetOptions"
              :key="opt.value"
              type="button"
              class="paper-editor-panel__chip"
              :class="{
                'paper-editor-panel__chip--active':
                  (!opt.value && !actions.fmt.value.lineHeight) ||
                  actions.fmt.value.lineHeight === opt.value,
              }"
              :disabled="!selectionActive"
              @click="setLineHeight(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="paper-editor-panel__divider" />

        <h4 class="paper-editor-tab__label">Effects</h4>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Outline</span>
          <div class="paper-editor-panel__chip-row">
            <button
              v-for="opt in textOutlinePresetOptions"
              :key="opt.value"
              type="button"
              class="paper-editor-panel__chip"
              :class="{
                'paper-editor-panel__chip--active':
                  (!opt.value && !actions.fmt.value.textOutlineWidth) ||
                  (opt.value === 'thin' &&
                    actions.fmt.value.textOutlineWidth === '1px') ||
                  (opt.value === 'medium' &&
                    actions.fmt.value.textOutlineWidth === '2px'),
              }"
              :disabled="!selectionActive"
              @click="setTextOutline(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="paper-editor-panel__divider" />

        <h4 class="paper-editor-tab__label">Indent</h4>
        <div class="paper-editor-panel__tool-row">
          <button
            type="button"
            class="paper-editor-panel__chip"
            :disabled="!selectionActive || actions.fmt.value.indent <= 0"
            @click="runOutdent"
          >
            ← Outdent
          </button>
          <span class="paper-editor-panel__indent-display">{{
            actions.fmt.value.indentMixed ? 'Mixed' : actions.fmt.value.indent
          }}</span>
          <button
            type="button"
            class="paper-editor-panel__chip"
            :disabled="!selectionActive || actions.fmt.value.indent >= 4"
            @click="runIndent"
          >
            Indent →
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
