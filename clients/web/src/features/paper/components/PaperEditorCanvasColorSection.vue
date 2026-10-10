<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import PaperColorPickerPanel, {
  type PaperColorSwatch,
} from '@/features/paper/components/PaperColorPickerPanel.vue';
import type { PaperColorKind } from '@/features/paper/composables/usePaperRecentColors';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import { pushPaperRecentColor } from '@/features/paper/composables/usePaperRecentColors';

const props = defineProps<{
  label: string;
  kind: PaperColorKind;
  color: string | null;
  mixed?: boolean;
  isDefault?: boolean;
  disabled?: boolean;
  quickPalette: readonly PaperColorSwatch[];
  documentPalette?: readonly PaperColorSwatch[];
  paperAppearance?: PaperAppearanceMode;
}>();

const emit = defineEmits<{
  pick: [value: string];
  clear: [];
}>();

const pickerOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string> | null>(null);

const quickSwatches = computed(() =>
  props.quickPalette.filter((s) => s.value.trim().length > 0),
);

const isNoneSwatch = (value: string) =>
  props.kind === 'object' && value.trim().toLowerCase() === 'transparent';

const pickerPalette = computed(() => {
  const doc = props.documentPalette ?? [];
  const seen = new Set<string>();
  const out: PaperColorSwatch[] = [];
  for (const swatch of doc) {
    const v = swatch.value.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(swatch);
  }
  return out;
});

const customSwatchStyle = computed(() => {
  if (props.mixed) {
    return {
      background: 'linear-gradient(135deg, #ef4444 0 50%, #3b82f6 50% 100%)',
    };
  }
  if (props.isDefault || !props.color) {
    return {
      background:
        'conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)',
    };
  }
  return { background: props.color };
});

const isActiveQuick = (value: string) => {
  if (props.mixed) return false;
  if (isNoneSwatch(value)) {
    return (
      !props.color ||
      props.color.trim().toLowerCase() === 'transparent' ||
      props.color.trim().toLowerCase() === 'none'
    );
  }
  if (!value) return !!props.isDefault;
  return props.color?.toLowerCase() === value.toLowerCase();
};

function closePicker() {
  pickerOpen.value = false;
}

async function positionPanel() {
  await nextTick();
  const root = rootRef.value;
  if (!root) {
    panelStyle.value = null;
    return;
  }
  const rect = root.getBoundingClientRect();
  const pad = 8;
  const panelWidth = Math.min(280, window.innerWidth - pad * 2);
  const left = Math.max(
    pad,
    Math.min(rect.left, window.innerWidth - panelWidth - pad),
  );
  panelStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${panelWidth}px`,
    top: `${rect.bottom + 8}px`,
    zIndex: '120',
  };
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!pickerOpen.value) return;
  const target = ev.target as Node;
  const root = rootRef.value;
  if (root?.contains(target)) return;
  const panel = document.getElementById(
    `paper-canvas-color-picker-${props.kind}`,
  );
  if (panel?.contains(target)) return;
  closePicker();
}

function pickQuick(value: string) {
  if (props.disabled) return;
  pushPaperRecentColor(props.kind, value);
  emit('pick', value);
}

function onPick(value: string) {
  emit('pick', value);
  closePicker();
}

function onClear() {
  emit('clear');
  closePicker();
}

function togglePicker() {
  if (props.disabled) return;
  pickerOpen.value = !pickerOpen.value;
}

watch(pickerOpen, (open) => {
  if (open) {
    void positionPanel();
    document.addEventListener('pointerdown', onDocumentPointerDown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
    panelStyle.value = null;
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  window.removeEventListener('resize', positionPanel);
  window.removeEventListener('scroll', positionPanel, true);
});
</script>

<template>
  <section
    ref="rootRef"
    class="paper-canvas-color-section"
    :class="{ 'paper-canvas-color-section--disabled': disabled }"
  >
    <h4 v-if="label" class="paper-editor-tab__label">{{ label }}</h4>
    <div class="paper-canvas-color-section__grid" role="list">
      <button
        v-for="swatch in quickSwatches"
        :key="swatch.value"
        type="button"
        class="paper-canvas-color-section__swatch"
        :class="{
          'paper-canvas-color-section__swatch--active': isActiveQuick(
            swatch.value,
          ),
          'paper-canvas-color-section__swatch--square':
            kind === 'highlight' || kind === 'object',
          'paper-canvas-color-section__swatch--none': isNoneSwatch(
            swatch.value,
          ),
        }"
        :style="
          isNoneSwatch(swatch.value) ? undefined : { background: swatch.value }
        "
        :title="swatch.label"
        :aria-label="swatch.label"
        :disabled="disabled"
        @click="pickQuick(swatch.value)"
      />
      <button
        type="button"
        class="paper-canvas-color-section__swatch paper-canvas-color-section__swatch--custom"
        :class="{
          'paper-canvas-color-section__swatch--square':
            kind === 'highlight' || kind === 'object',
          'paper-canvas-color-section__swatch--open': pickerOpen,
        }"
        :style="customSwatchStyle"
        :title="
          mixed
            ? `${label}: mixed colors (pick one to apply to selection)`
            : isDefault
              ? `${label}: pick a custom color`
              : `${label}: ${color ?? ''} — open color picker`
        "
        :aria-label="`${label} color picker`"
        :aria-expanded="pickerOpen"
        :disabled="disabled"
        @click="togglePicker"
      >
        <span
          v-if="mixed"
          class="paper-canvas-color-section__glyph"
          aria-hidden="true"
          >…</span
        >
        <svg
          v-else
          class="paper-canvas-color-section__glyph"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="pickerOpen && panelStyle"
        :id="`paper-canvas-color-picker-${kind}`"
        class="paper-color-picker-shell paper-teleport-surface"
        :data-paper-appearance="paperAppearance ?? 'light'"
        :style="panelStyle"
        @click.stop
        @mousedown.prevent
      >
        <PaperColorPickerPanel
          :kind="kind"
          :palette="pickerPalette"
          :color="color"
          :mixed="mixed"
          :is-default="isDefault"
          @pick="onPick"
          @clear="onClear"
          @close="closePicker"
        />
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./styles/PaperEditorCanvasColorSection.scss"></style>
