<script setup lang="ts">
import { computed } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/paperEditorPanelBridge';
import PaperEditorCanvasColorSection from '@/features/paper/components/PaperEditorCanvasColorSection.vue';
import {
  PAPER_PAGE_COLOR_PRESETS,
  isPaperPagePresetActive,
} from '@/features/paper/editor/paperPagePresets';
import {
  derivePaperSurfaceStyle,
  isPaperDarkAppearance,
  paperAppearanceCanvasLabel,
  PAPER_DEFAULT_PAGE_HEX,
  type PaperAppearanceMode,
} from '@/features/paper/editor/paperPageAppearance';
import { extractPaperDocumentColors } from '@/features/paper/editor/extractPaperDocumentColors';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  appearance: PaperAppearanceMode;
}>();

const pageLight = computed(
  () => props.context.paperPageColorLight.value ?? '#ffffff',
);
const pageDark = computed(
  () => props.context.paperPageColorDark.value ?? '#16161c',
);

const previewStyle = computed(() => {
  const hex = isPaperDarkAppearance(props.appearance)
    ? pageDark.value
    : props.appearance === 'sunny'
      ? (props.context.paperPageColorLight.value ??
        PAPER_DEFAULT_PAGE_HEX.sunny)
      : pageLight.value;
  return derivePaperSurfaceStyle(hex);
});

const canvasKind = computed(() =>
  isPaperDarkAppearance(props.appearance) ? 'pageDark' : 'pageLight',
);

const canvasColor = computed(() =>
  isPaperDarkAppearance(props.appearance) ? pageDark.value : pageLight.value,
);

const canvasQuickPalette = computed(() => {
  const seen = new Set<string>();
  const out: { label: string; value: string }[] = [];
  for (const preset of PAPER_PAGE_COLOR_PRESETS) {
    const value = isPaperDarkAppearance(props.appearance)
      ? preset.dark
      : preset.light;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: preset.label, value });
  }
  return out;
});

const documentPalette = computed(
  () => extractPaperDocumentColors(props.context.contentJson.value).page,
);

const canvasSectionLabel = computed(() =>
  paperAppearanceCanvasLabel(props.appearance),
);

function onCanvasPick(hex: string) {
  if (isPaperDarkAppearance(props.appearance)) {
    props.context.onPageColorDark(hex);
  } else {
    props.context.onPageColorLight(hex);
  }
}

function onCanvasClear() {
  if (isPaperDarkAppearance(props.appearance)) {
    props.context.onPageColorDark(null);
  } else {
    props.context.onPageColorLight(null);
  }
}

function applyPreset(light: string, dark: string) {
  props.context.onPageColorLight(light);
  props.context.onPageColorDark(dark);
}
</script>

<template>
  <div class="paper-editor-tab paper-design-tab">
    <div
      class="paper-editor-page-preview"
      :style="previewStyle"
      aria-hidden="true"
    >
      <span
        class="paper-editor-page-preview__line paper-editor-page-preview__line--title"
      />
      <span class="paper-editor-page-preview__line" />
      <span
        class="paper-editor-page-preview__line paper-editor-page-preview__line--short"
      />
    </div>

    <PaperEditorCanvasColorSection
      :label="canvasSectionLabel"
      :kind="canvasKind"
      :color="canvasColor"
      :quick-palette="canvasQuickPalette"
      :document-palette="documentPalette"
      :paper-appearance="appearance"
      @pick="onCanvasPick"
      @clear="onCanvasClear"
    />

    <section class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Page presets</h4>
      <div class="paper-design-tab__preset-grid">
        <button
          v-for="preset in PAPER_PAGE_COLOR_PRESETS"
          :key="preset.label"
          type="button"
          class="paper-design-tab__preset-btn"
          :class="{
            'paper-design-tab__preset-btn--active': isPaperPagePresetActive(
              pageLight,
              pageDark,
              preset,
            ),
          }"
          :title="preset.label"
          @click="applyPreset(preset.light, preset.dark)"
        >
          <span
            class="paper-design-tab__preset-swatch"
            :style="{
              background: `linear-gradient(135deg, ${preset.light} 0 50%, ${preset.dark} 50% 100%)`,
            }"
          />
          <span class="paper-design-tab__preset-name">{{ preset.label }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.paper-design-tab__preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.paper-design-tab__preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem;
  border-radius: 0.625rem;
  transition: background 0.15s ease;
}

.paper-design-tab__preset-btn:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.paper-design-tab__preset-btn--active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  box-shadow: inset 0 0 0 1.5px var(--accent);
}

.paper-design-tab__preset-swatch {
  width: 100%;
  aspect-ratio: 1.35;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.paper-design-tab__preset-name {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.1;
}
</style>
