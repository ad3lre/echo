<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { hexToHsv, hsvToHex } from '@/features/server-settings/colorUtils';
import {
  pushPaperRecentColor,
  readPaperRecentColors,
  type PaperColorKind,
} from '@/features/paper/composables/usePaperRecentColors';
export type PaperColorSwatch = { label: string; value: string };

const props = defineProps<{
  kind: PaperColorKind;
  palette: readonly PaperColorSwatch[];
  color: string | null;
  mixed?: boolean;
  isDefault?: boolean;
  /** When true, renders as inline panel content (no teleport positioning). */
  embedded?: boolean;
}>();

const emit = defineEmits<{
  pick: [value: string];
  clear: [];
  close: [];
}>();

const recentColors = ref<string[]>(readPaperRecentColors(props.kind));

const paletteSwatches = computed(() =>
  props.palette.filter((s) => s.value.trim().length > 0),
);

const pickerH = ref(220);
const pickerS = ref(0.75);
const pickerV = ref(0.85);
const hexInput = ref('#2563eb');

const svRef = ref<HTMLElement | null>(null);
const hueRef = ref<HTMLElement | null>(null);
let dragTarget: 'sv' | 'hue' | null = null;

const clearLabel = computed(() => {
  if (props.kind === 'text') return 'Use default text color';
  if (props.kind === 'highlight') return 'Remove highlight';
  if (props.kind === 'pageLight') return 'Use default light page color';
  if (props.kind === 'pageDark') return 'Use default dark page color';
  if (props.kind === 'object') return 'No fill';
  return 'Reset';
});

const previewHex = computed(() =>
  hsvToHex(pickerH.value, pickerS.value, pickerV.value).toLowerCase(),
);

const svCursorStyle = computed(() => ({
  left: `${pickerS.value * 100}%`,
  top: `${(1 - pickerV.value) * 100}%`,
  background: previewHex.value,
}));

const svPlaneStyle = computed(() => ({
  background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${pickerH.value} 100% 50%))`,
}));

const hueThumbStyle = computed(() => ({
  top: `${(pickerH.value / 360) * 100}%`,
  background: `hsl(${pickerH.value} 100% 50%)`,
}));

function syncPickerFromHex(hex: string | null | undefined) {
  const hsv = hex ? hexToHsv(hex) : null;
  if (!hsv) return;
  pickerH.value = hsv.h;
  pickerS.value = hsv.s;
  pickerV.value = hsv.v;
  hexInput.value = hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase();
}

function commitCustom() {
  const hex = previewHex.value;
  recentColors.value = pushPaperRecentColor(props.kind, hex);
  emit('pick', hex);
}

function pickPalette(value: string) {
  recentColors.value = pushPaperRecentColor(props.kind, value);
  emit('pick', value);
}

function pickRecent(value: string) {
  syncPickerFromHex(value);
  recentColors.value = pushPaperRecentColor(props.kind, value);
  emit('pick', value);
}

function onHexInput(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value.trim();
  hexInput.value = raw;
  const hsv = hexToHsv(raw.startsWith('#') ? raw : `#${raw}`);
  if (!hsv) return;
  pickerH.value = hsv.h;
  pickerS.value = hsv.s;
  pickerV.value = hsv.v;
}

function onHexCommit() {
  const hsv = hexToHsv(
    hexInput.value.startsWith('#') ? hexInput.value : `#${hexInput.value}`,
  );
  if (!hsv) {
    hexInput.value = previewHex.value;
    return;
  }
  commitCustom();
}

function updateFromSv(ev: PointerEvent) {
  const el = svRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  pickerS.value = Math.max(
    0,
    Math.min(1, (ev.clientX - rect.left) / rect.width),
  );
  pickerV.value = Math.max(
    0,
    Math.min(1, 1 - (ev.clientY - rect.top) / rect.height),
  );
  hexInput.value = previewHex.value;
}

function updateFromHue(ev: PointerEvent) {
  const el = hueRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  pickerH.value = Math.max(
    0,
    Math.min(360, ((ev.clientY - rect.top) / rect.height) * 360),
  );
  hexInput.value = previewHex.value;
}

function onPointerDown(target: 'sv' | 'hue', ev: PointerEvent) {
  dragTarget = target;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  if (target === 'sv') updateFromSv(ev);
  else updateFromHue(ev);
}

function onPointerMove(ev: PointerEvent) {
  if (!dragTarget) return;
  if (dragTarget === 'sv') updateFromSv(ev);
  else updateFromHue(ev);
}

function onPointerUp(ev: PointerEvent) {
  if (!dragTarget) return;
  (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
  dragTarget = null;
  commitCustom();
}

function isActiveSwatch(value: string) {
  if (props.mixed) return false;
  if (!value) return !!props.isDefault;
  return props.color?.toLowerCase() === value.toLowerCase();
}

watch(
  () => props.color,
  (c) => {
    if (!props.mixed && c) syncPickerFromHex(c);
  },
  { immediate: true },
);

onUnmounted(() => {
  dragTarget = null;
});
</script>

<template>
  <div
    class="paper-color-picker-panel"
    :class="{ 'paper-color-picker-panel--embedded': embedded }"
    @click.stop
    @mousedown.prevent
  >
    <section v-if="recentColors.length" class="paper-color-picker-section">
      <p class="paper-color-picker-label">Recently used</p>
      <div class="paper-color-picker-swatches">
        <button
          v-for="hex in recentColors"
          :key="`recent-${hex}`"
          type="button"
          class="paper-color-picker-swatch"
          :class="{
            'paper-color-picker-swatch--active': isActiveSwatch(hex),
            'paper-color-picker-swatch--square':
              kind === 'highlight' || kind === 'object',
          }"
          :style="{ background: hex }"
          :title="hex"
          :aria-label="`Recent color ${hex}`"
          @click="pickRecent(hex)"
        />
      </div>
    </section>

    <section class="paper-color-picker-section">
      <p class="paper-color-picker-label">Document colors</p>
      <div class="paper-color-picker-swatches">
        <button
          v-for="swatch in paletteSwatches"
          :key="swatch.value"
          type="button"
          class="paper-color-picker-swatch"
          :class="{
            'paper-color-picker-swatch--active': isActiveSwatch(swatch.value),
            'paper-color-picker-swatch--square':
              kind === 'highlight' || kind === 'object',
          }"
          :style="{ background: swatch.value }"
          :title="swatch.label"
          :aria-label="swatch.label"
          @click="pickPalette(swatch.value)"
        />
      </div>
    </section>

    <section class="paper-color-picker-section paper-color-picker-custom">
      <p class="paper-color-picker-label">Custom</p>
      <div class="paper-color-picker-custom-row">
        <div
          ref="svRef"
          class="paper-color-picker-sv"
          :style="svPlaneStyle"
          role="slider"
          aria-label="Saturation and brightness"
          tabindex="0"
          @pointerdown="onPointerDown('sv', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span
            class="paper-color-picker-sv-thumb"
            :style="svCursorStyle"
            aria-hidden="true"
          />
        </div>
        <div
          ref="hueRef"
          class="paper-color-picker-hue"
          role="slider"
          aria-label="Hue"
          tabindex="0"
          @pointerdown="onPointerDown('hue', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span
            class="paper-color-picker-hue-thumb"
            :style="hueThumbStyle"
            aria-hidden="true"
          />
        </div>
      </div>
      <div class="paper-color-picker-hex-row">
        <span
          class="paper-color-picker-hex-preview"
          :style="{ background: previewHex }"
          aria-hidden="true"
        />
        <input
          type="text"
          class="paper-color-picker-hex-input"
          :value="hexInput"
          spellcheck="false"
          aria-label="Hex color"
          @input="onHexInput"
          @change="onHexCommit"
          @keydown.enter.prevent="onHexCommit"
        />
      </div>
    </section>

    <button
      type="button"
      class="paper-color-picker-default"
      @click="
        emit('clear');
        emit('close');
      "
    >
      {{ clearLabel }}
    </button>
  </div>
</template>

<style scoped src="./styles/PaperColorPickerPanel.scss"></style>
