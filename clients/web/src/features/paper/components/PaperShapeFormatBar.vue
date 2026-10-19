<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref } from 'vue';
import type { Editor } from '@tiptap/core';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import type { usePaperImageUpload } from '@/features/paper/composables/usePaperImageUpload';
import type { PaperShapeAlign } from '@/features/paper/editor/paperShapeExtension';
import {
  PAPER_SHAPE_SIZE_PRESETS,
  usePaperShapeActions,
} from '@/features/paper/composables/usePaperShapeActions';
import {
  PAPER_SHAPE_MAX_PX,
  PAPER_SHAPE_MIN_PX,
} from '@/features/paper/editor/paperShapeUtils';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import PaperFormatPresetMenu from '@/features/paper/components/PaperFormatPresetMenu.vue';
import PaperColorControl from '@/features/paper/components/PaperColorControl.vue';
import { PAPER_OBJECT_COLORS } from '@/features/paper/editor/paperTypography';
import {
  PAPER_SHAPE_BORDER_STYLES,
  PAPER_SHAPE_BORDER_WIDTHS,
} from '@/features/paper/editor/paperShapeUtils';
import type { PaperShapeBorderStyle } from '@/features/paper/editor/paperShapeExtension';

const SIZE_LABEL_KEYS: Record<string, string> = {
  Small: 'b26.paperShape.sizes.small',
  Medium: 'b26.paperShape.sizes.medium',
  Large: 'b26.paperShape.sizes.large',
};
const STYLE_LABEL_KEYS: Record<string, string> = {
  solid: 'b26.paperShape.styles.solid',
  dashed: 'b26.paperShape.styles.dashed',
  dotted: 'b26.paperShape.styles.dotted',
};

const props = defineProps<{
  editor: Editor | null;
  visible?: boolean;
  pageLayout?: PaperPageLayout;
  paperAppearance?: PaperAppearanceMode;
  imageUpload?: ReturnType<typeof usePaperImageUpload>;
}>();

const shapeImageInput = ref<HTMLInputElement | null>(null);

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
      label: SIZE_LABEL_KEYS[p.label]
        ? echoT(SIZE_LABEL_KEYS[p.label]!)
        : p.label,
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

const currentShapeWidth = computed(
  () => shapeActions.selectedShapeSizePx().width,
);

const canDecreaseShapeSize = computed(
  () => currentShapeWidth.value > PAPER_SHAPE_MIN_PX,
);

const canIncreaseShapeSize = computed(
  () => currentShapeWidth.value < PAPER_SHAPE_MAX_PX,
);

function stepSize(direction: 'up' | 'down') {
  shapeActions.stepShapeSize(direction);
}

function setAlign(align: PaperShapeAlign) {
  shapeActions.setShapeAlign(align);
}

const hasShapeImage = computed(() => {
  const src = shapeActions.selectedShapeAttrs()?.imageSrc;
  return typeof src === 'string' && src.trim().length > 0;
});

function openShapeImagePicker() {
  shapeImageInput.value?.click();
}

async function onShapeImagePick(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  const input = ev.target as HTMLInputElement;
  input.value = '';
  const ed = props.editor;
  const upload = props.imageUpload;
  if (!file || !ed || !upload) return;
  const url = await upload.uploadImageFileToUrl(file);
  if (url) shapeActions.setShapeImage(url);
}

const objectPalette = PAPER_OBJECT_COLORS.filter(
  (s) => s.value.trim().length > 0,
);

const shapeFillColor = computed(
  () => shapeActions.selectedShapeFill() ?? 'transparent',
);

const shapeFillIsNone = computed(() => shapeActions.selectedShapeFillIsNone());

const shapeBorderColor = computed(
  () => shapeActions.selectedShapeBorderColor() ?? 'transparent',
);

const shapeBorderWidth = computed(() =>
  String(shapeActions.selectedShapeBorderWidthPx()),
);

const shapeBorderStyle = computed(() =>
  shapeActions.selectedShapeBorderStyle(),
);

const borderWidthOptions = computed<EchoDropdownOption[]>(() =>
  PAPER_SHAPE_BORDER_WIDTHS.map((px) => ({
    label: px === 0 ? echoT('b26.paperShape.noBorder') : `${px}px`,
    value: String(px),
  })),
);

const borderStyleOptions = computed<EchoDropdownOption[]>(() =>
  PAPER_SHAPE_BORDER_STYLES.map((entry) => ({
    label: STYLE_LABEL_KEYS[entry.value]
      ? echoT(STYLE_LABEL_KEYS[entry.value]!)
      : entry.label,
    value: entry.value,
  })),
);

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
    :aria-label="echoT('b26.paperShape.toolbar')"
  >
    <div
      class="pointer-events-auto flex items-center gap-1 overflow-x-auto overflow-y-visible rounded-full border border-border px-2 py-1 shadow-lg backdrop-blur-md"
      style="background: var(--paper-format-bar-bg)"
    >
      <button
        type="button"
        class="paper-format-btn"
        :aria-label="echoT('b26.paperShape.decrease')"
        :disabled="!canDecreaseShapeSize"
        @mousedown.prevent="stepSize('down')"
      >
        −
      </button>
      <PaperFormatPresetMenu
        :model-value="currentSizeValue"
        :options="sizeOptions"
        :paper-appearance="paperAppearance ?? 'light'"
        trigger-mode="label"
        placement="above"
        :title="echoT('b26.paperShape.size')"
        @update:model-value="setSize"
      />
      <button
        type="button"
        class="paper-format-btn"
        :aria-label="echoT('b26.paperShape.increase')"
        :disabled="!canIncreaseShapeSize"
        @mousedown.prevent="stepSize('up')"
      >
        +
      </button>

      <span class="paper-format-divider" aria-hidden="true" />

      <PaperColorControl
        :label="echoT('b26.paperShape.fillColor')"
        variant="object"
        :color="shapeFillColor"
        :is-default="shapeFillIsNone"
        :palette="objectPalette"
        :page-layout="pageLayout"
        :paper-appearance="paperAppearance"
        @input="shapeActions.setObjectFill"
        @clear="shapeActions.clearObjectFill"
      />

      <PaperColorControl
        :label="echoT('b26.paperShape.borderColor')"
        variant="border"
        :color="shapeBorderColor"
        :is-default="shapeActions.selectedShapeBorderWidthPx() === 0"
        :palette="objectPalette.filter((s) => s.value !== 'transparent')"
        :page-layout="pageLayout"
        :paper-appearance="paperAppearance"
        @input="(v) => shapeActions.setShapeBorderColor(v)"
        @clear="shapeActions.clearShapeBorder"
      />

      <EchoDropdown
        :model-value="shapeBorderWidth"
        :options="borderWidthOptions"
        :label="echoT('b26.paperShape.borderWidth')"
        compact
        @update:model-value="(v) => shapeActions.setShapeBorderWidth(Number(v))"
      />

      <EchoDropdown
        v-if="shapeActions.selectedShapeBorderWidthPx() > 0"
        :model-value="shapeBorderStyle"
        :options="borderStyleOptions"
        :label="echoT('b26.paperShape.borderStyle')"
        compact
        @update:model-value="
          (v) => shapeActions.setShapeBorderStyle(v as PaperShapeBorderStyle)
        "
      />

      <span class="paper-format-divider" aria-hidden="true" />

      <button
        type="button"
        class="paper-format-btn"
        :class="{ 'paper-format-btn--active': hasShapeImage }"
        :title="echoT('b26.paperShape.addImage')"
        :aria-label="echoT('b26.paperShape.addImage')"
        :disabled="imageUpload?.uploading.value"
        @mousedown.prevent="openShapeImagePicker"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10.5" r="1.5" />
          <path d="M21 16l-5-5L8 19" />
        </svg>
      </button>
      <button
        v-if="hasShapeImage"
        type="button"
        class="paper-format-btn"
        :title="echoT('b26.paperShape.removeImage')"
        :aria-label="echoT('b26.paperShape.removeImage')"
        @mousedown.prevent="shapeActions.clearShapeImage()"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <input
        ref="shapeImageInput"
        type="file"
        accept="image/*"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onShapeImagePick"
      />

      <span class="paper-format-divider" aria-hidden="true" />

      <div
        class="paper-shape-align-group"
        role="group"
        :aria-label="echoT('b26.paperShape.position')"
      >
        <button
          type="button"
          class="paper-format-btn"
          :class="{ 'paper-format-btn--active': currentAlign === 'left' }"
          :title="echoT('b26.paperShape.alignLeft')"
          :aria-label="echoT('b26.paperShape.alignLeft')"
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
          :title="echoT('b26.paperShape.alignCenter')"
          :aria-label="echoT('b26.paperShape.alignCenter')"
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
          :title="echoT('b26.paperShape.alignRight')"
          :aria-label="echoT('b26.paperShape.alignRight')"
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

.paper-format-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.paper-format-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
