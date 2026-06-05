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
  if (props.kind === 'object') return 'Use default object color';
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

<style scoped>
.paper-color-picker-panel {
  padding: 0.5rem 0.65rem 0.55rem;
}

.paper-color-picker-section + .paper-color-picker-section {
  margin-top: 0.5rem;
}

.paper-color-picker-label {
  margin: 0 0 0.35rem;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.paper-color-picker-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(1.375rem, 1fr));
  gap: 0.35rem;
}

.paper-color-picker-swatch {
  aspect-ratio: 1;
  width: 100%;
  max-width: 1.5rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  cursor: pointer;
  transition:
    transform 0.1s ease,
    box-shadow 0.1s ease;
}

.paper-color-picker-swatch--square {
  border-radius: 4px;
  max-width: 1.625rem;
}

.paper-color-picker-swatch:hover {
  transform: scale(1.08);
}

.paper-color-picker-swatch--active {
  box-shadow:
    0 0 0 2px var(--elevated),
    0 0 0 3px var(--accent);
}

.paper-color-picker-custom-row {
  display: flex;
  gap: 0.4rem;
  align-items: stretch;
}

.paper-color-picker-sv {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 3.25rem;
  border-radius: 8px;
  cursor: crosshair;
  touch-action: none;
}

.paper-color-picker-hue {
  position: relative;
  width: 0.65rem;
  flex-shrink: 0;
  border-radius: 9999px;
  background: linear-gradient(
    to bottom,
    #ff0000,
    #ffff00,
    #00ff00,
    #00ffff,
    #0000ff,
    #ff00ff,
    #ff0000
  );
  cursor: pointer;
  touch-action: none;
}

.paper-color-picker-sv-thumb,
.paper-color-picker-hue-thumb {
  position: absolute;
  width: 0.75rem;
  height: 0.75rem;
  margin-left: -0.375rem;
  margin-top: -0.375rem;
  border-radius: 9999px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.paper-color-picker-hue-thumb {
  left: 50%;
  margin-left: -0.375rem;
  margin-top: -0.375rem;
}

.paper-color-picker-hex-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.paper-color-picker-hex-preview {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.paper-color-picker-hex-input {
  flex: 1;
  min-width: 0;
  height: 1.625rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--ui-glass-2);
  padding: 0 0.4rem;
  font-size: 0.75rem;
  font-family: ui-monospace, monospace;
  color: var(--text);
}

.paper-color-picker-hex-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.paper-color-picker-default {
  display: block;
  width: 100%;
  margin-top: 0.45rem;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--text);
  text-align: left;
}

.paper-color-picker-default:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.paper-color-picker-panel--embedded {
  position: static;
  width: 100%;
  box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 0.625rem;
  padding: 0.5rem;
  background: color-mix(in srgb, var(--text) 4%, transparent);
}
</style>
