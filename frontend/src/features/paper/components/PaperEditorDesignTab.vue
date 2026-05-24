<script setup lang="ts">
import { computed } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import PaperColorPickerPanel from '@/features/paper/components/PaperColorPickerPanel.vue';
import {
  PAPER_PAGE_COLOR_PRESETS,
  isPaperPagePresetActive,
} from '@/features/paper/editor/paperPagePresets';
import { derivePaperSurfaceStyle } from '@/features/paper/editor/paperPageAppearance';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  appearance: 'light' | 'dark';
}>();

const pageLight = computed(
  () => props.context.paperPageColorLight.value ?? '#ffffff',
);
const pageDark = computed(
  () => props.context.paperPageColorDark.value ?? '#16161c',
);

const previewStyle = computed(() => {
  const hex = props.appearance === 'dark' ? pageDark.value : pageLight.value;
  return derivePaperSurfaceStyle(hex);
});

const pagePalette = computed(() =>
  PAPER_PAGE_COLOR_PRESETS.map((p) => ({
    label: p.label,
    value: props.appearance === 'dark' ? p.dark : p.light,
  })),
);

function applyPreset(light: string, dark: string) {
  props.context.onPageColorLight(light);
  props.context.onPageColorDark(dark);
}
</script>

<template>
  <div class="paper-editor-tab">
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

    <section class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Presets</h4>
      <div class="paper-editor-panel__preset-grid">
        <button
          v-for="preset in PAPER_PAGE_COLOR_PRESETS"
          :key="preset.label"
          type="button"
          class="paper-editor-panel__preset"
          :class="{
            'paper-editor-panel__preset--active': isPaperPagePresetActive(
              pageLight,
              pageDark,
              preset,
            ),
          }"
          :title="preset.label"
          @click="applyPreset(preset.light, preset.dark)"
        >
          <span
            class="paper-editor-panel__preset-swatch"
            :style="{
              background: `linear-gradient(135deg, ${preset.light} 0 50%, ${preset.dark} 50% 100%)`,
            }"
          />
          <span class="paper-editor-panel__preset-label">{{
            preset.label
          }}</span>
        </button>
      </div>
    </section>

    <section class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Light page color</h4>
      <PaperColorPickerPanel
        kind="pageLight"
        embedded
        :palette="pagePalette"
        :color="pageLight"
        @pick="context.onPageColorLight"
      />
    </section>

    <section class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Dark page color</h4>
      <PaperColorPickerPanel
        kind="pageDark"
        embedded
        :palette="pagePalette"
        :color="pageDark"
        @pick="context.onPageColorDark"
      />
    </section>
  </div>
</template>
