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
  appearance: 'light' | 'dark' | 'amber';
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
  <div class="paper-editor-tab paper-colors-tab">
    <section class="paper-editor-tab__block">
      <h3 class="paper-colors-tab__section-title">Page colors</h3>
      <p class="paper-colors-tab__hint">
        Choose colors for light and dark preview modes.
      </p>

      <div class="paper-colors-tab__mode-grid">
        <div class="paper-colors-tab__mode-card">
          <span class="paper-colors-tab__mode-label">Light</span>
          <div
            class="paper-colors-tab__color-preview"
            :style="{ backgroundColor: pageLight }"
          />
          <PaperColorPickerPanel
            kind="pageLight"
            embedded
            compact
            :palette="pagePalette"
            :color="pageLight"
            @pick="context.onPageColorLight"
            @clear="context.onPageColorLight(null)"
          />
        </div>
        <div class="paper-colors-tab__mode-card">
          <span class="paper-colors-tab__mode-label">Dark</span>
          <div
            class="paper-colors-tab__color-preview"
            :style="{ backgroundColor: pageDark }"
          />
          <PaperColorPickerPanel
            kind="pageDark"
            embedded
            compact
            :palette="pagePalette"
            :color="pageDark"
            @pick="context.onPageColorDark"
            @clear="context.onPageColorDark(null)"
          />
        </div>
      </div>
    </section>

    <section class="paper-editor-tab__block">
      <h4 class="paper-editor-tab__label">Presets</h4>
      <div class="paper-colors-tab__preset-grid">
        <button
          v-for="preset in PAPER_PAGE_COLOR_PRESETS"
          :key="preset.label"
          type="button"
          class="paper-colors-tab__preset-btn"
          :class="{
            'paper-colors-tab__preset-btn--active': isPaperPagePresetActive(
              pageLight,
              pageDark,
              preset,
            ),
          }"
          :title="preset.label"
          @click="applyPreset(preset.light, preset.dark)"
        >
          <span
            class="paper-colors-tab__preset-swatch"
            :style="{
              background: `linear-gradient(135deg, ${preset.light} 0 50%, ${preset.dark} 50% 100%)`,
            }"
          />
          <span class="paper-colors-tab__preset-name">{{ preset.label }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
