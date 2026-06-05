<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import { extractPaperDocumentImages } from '@/features/paper/editor/extractPaperDocumentImages';
import { useImageSearch } from '@/composables/useImageSearch';
import PaperPromptDialog from '@/features/paper/components/PaperPromptDialog.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import type {
  PaperImageAlign,
  PaperImageWrap,
} from '@/features/paper/editor/paperImageExtension';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';
import PaperFormatPresetMenu from '@/features/paper/components/PaperFormatPresetMenu.vue';
import {
  runPaperFormatCommand,
  snapshotPaperEditorCaret,
} from '@/features/paper/editor/paperFormatSelection';
import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';
import {
  PAPER_SHAPE_SIZE_PRESETS,
  usePaperShapeActions,
} from '@/features/paper/composables/usePaperShapeActions';
import type {
  PaperShapeAlign,
  PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  editorEditable: boolean;
}>();

const editorRef = computed(() => props.context.editor.value);
const shapeActions = usePaperShapeActions(editorRef);

const shapeTools: { id: PaperShapeKind; label: string }[] = [
  { id: 'rectangle', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'line', label: 'Line' },
];
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const imageUrlDialogOpen = ref(false);
const imageUrlError = ref<string | null>(null);
const searchQuery = ref('');

const isImageSelected = computed(
  () => editorRef.value?.isActive('image') ?? false,
);

const isShapeSelected = computed(() => shapeActions.isShapeSelected());

const selectedShapeAttrs = computed(() => shapeActions.selectedShapeAttrs());

const shapeSizeOptions: EchoDropdownOption[] = PAPER_SHAPE_SIZE_PRESETS.map(
  (p) => ({
    label: p.label,
    value: String(p.px),
  }),
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

const currentShapeAlign = computed(() => shapeActions.selectedShapeAlign());

const selectedImageAttrs = computed(() => {
  const ed = editorRef.value;
  if (!ed || !ed.isActive('image')) return null;
  return ed.getAttributes('image');
});

const widthOptions: EchoDropdownOption[] = [
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '100%', value: '100%' },
  { label: 'Auto', value: '' },
];

const alignOptions: EchoDropdownOption[] = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const wrapOptions: EchoDropdownOption[] = [
  { label: 'None', value: 'none' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
];

const currentWidth = computed(() => selectedImageAttrs.value?.width ?? '');
const currentAlign = computed(
  () => (selectedImageAttrs.value?.align as PaperImageAlign) ?? 'center',
);
const currentWrap = computed(
  () => (selectedImageAttrs.value?.wrap as PaperImageWrap) ?? 'none',
);

function setImageWidth(value: string) {
  runPaperFormatCommand(editorRef.value, (chain) =>
    chain.updateAttributes('image', { width: value || null }),
  );
}

function setImageAlign(value: string) {
  runPaperFormatCommand(editorRef.value, (chain) =>
    chain.updateAttributes('image', { align: value as PaperImageAlign }),
  );
}

function setImageWrap(value: string) {
  runPaperFormatCommand(editorRef.value, (chain) =>
    chain.updateAttributes('image', { wrap: value as PaperImageWrap }),
  );
}

function setShapeSize(value: string) {
  shapeActions.setShapeSizePx(Number(value));
}

function setShapeAlign(value: string) {
  shapeActions.setShapeAlign(value as PaperShapeAlign);
}

const {
  images: searchResults,
  loading: searchLoading,
  error: searchError,
  search: runSearch,
} = useImageSearch();

const docImages = computed(() =>
  extractPaperDocumentImages(props.context.contentJson.value),
);

function onPickImage() {
  snapshotPaperEditorCaret(editorRef.value);
  fileInput.value?.click();
}

function openImageUrlDialog() {
  snapshotPaperEditorCaret(editorRef.value);
  imageUrlDialogOpen.value = true;
}

async function insertFiles(files: FileList | File[]) {
  const editor = editorRef.value;
  if (!editor) return;
  const list = Array.from(files);
  for (const file of list) {
    if (inferChatPendingMediaKind(file) !== 'image') continue;
    await props.context.imageUpload.insertImageFile(editor, file);
    break;
  }
}

async function onImageFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const files = input.files;
  input.value = '';
  if (!files?.length) return;
  await insertFiles(files);
}

function onDrop(ev: DragEvent) {
  dragOver.value = false;
  if (!props.editorEditable) return;
  snapshotPaperEditorCaret(editorRef.value);
  const files = ev.dataTransfer?.files;
  if (!files?.length) return;
  ev.preventDefault();
  void insertFiles(files);
}

function onImageUrlConfirm(src: string) {
  imageUrlDialogOpen.value = false;
  const editor = editorRef.value;
  if (!editor || !src) return;
  imageUrlError.value = null;
  if (!props.context.imageUpload.insertImageUrl(editor, src)) {
    imageUrlError.value = 'That URL is not allowed for images.';
    imageUrlDialogOpen.value = true;
  }
}

function insertSearchUrl(url: string) {
  const editor = editorRef.value;
  if (!editor) return;
  props.context.imageUpload.insertImageUrl(editor, url);
}

function onDocImageClick(src: string, blockId?: string) {
  if (blockId && props.context.onScrollToBlock) {
    props.context.onScrollToBlock(blockId);
    return;
  }
  insertSearchUrl(src);
}

function submitSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  void runSearch(q);
}
</script>

<template>
  <div class="paper-editor-tab">
    <template v-if="editorEditable">
      <section
        class="paper-editor-upload-zone"
        :class="{ 'paper-editor-upload-zone--active': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop="onDrop"
      >
        <p class="paper-editor-upload-zone__title">Upload images</p>
        <p class="paper-editor-upload-zone__hint">
          Drag and drop or choose a file
        </p>
        <button
          type="button"
          class="paper-editor-panel__asset-btn"
          :disabled="context.imageUpload.uploading.value"
          @click="onPickImage()"
        >
          {{
            context.imageUpload.uploading.value ? 'Uploading…' : 'Choose file'
          }}
        </button>
      </section>

      <section class="paper-editor-tab__block">
        <button
          type="button"
          class="paper-editor-panel__asset-btn paper-editor-panel__asset-btn--ghost"
          @click="openImageUrlDialog()"
        >
          Insert from URL…
        </button>
      </section>

      <section class="paper-editor-tab__block">
        <h4 class="paper-editor-tab__label">Shapes</h4>
        <p class="paper-editor-tab__hint">
          Uses the fill color from Colors → Objects.
        </p>
        <div class="paper-colors-tab__shape-grid">
          <button
            v-for="tool in shapeTools"
            :key="tool.id"
            type="button"
            class="paper-colors-tab__shape-btn"
            :title="`Insert ${tool.label.toLowerCase()}`"
            :aria-label="`Insert ${tool.label.toLowerCase()}`"
            @mousedown.prevent.stop="shapeActions.insertShape(tool.id)"
          >
            <span
              class="paper-colors-tab__shape-preview"
              :class="`paper-colors-tab__shape-preview--${tool.id}`"
              :style="{
                backgroundColor: shapeActions.pendingObjectColor.value,
              }"
              aria-hidden="true"
            />
            <span class="paper-colors-tab__shape-label">{{ tool.label }}</span>
          </button>
        </div>
      </section>

      <section class="paper-editor-tab__block">
        <h4 class="paper-editor-tab__label">Search photos</h4>
        <form class="paper-editor-search" @submit.prevent="submitSearch">
          <input
            v-model="searchQuery"
            type="search"
            class="paper-editor-search__input"
            placeholder="Search images…"
            aria-label="Search stock images"
          />
          <button type="submit" class="paper-editor-search__btn">Search</button>
        </form>
        <p v-if="searchError" class="paper-editor-tab__hint">
          {{ searchError }}
        </p>
        <p v-else-if="searchLoading" class="paper-editor-tab__hint">
          Searching…
        </p>
        <div v-else-if="searchResults.length" class="paper-editor-image-grid">
          <button
            v-for="img in searchResults"
            :key="img.id"
            type="button"
            class="paper-editor-image-grid__item"
            @click="insertSearchUrl(img.url)"
          >
            <img
              :src="img.thumbUrl || img.url"
              :alt="img.alt || 'Image'"
              loading="lazy"
            />
          </button>
        </div>
      </section>

      <section v-if="docImages.length" class="paper-editor-tab__block">
        <h4 class="paper-editor-tab__label">In this document</h4>
        <div class="paper-editor-image-grid">
          <button
            v-for="img in docImages"
            :key="img.src"
            type="button"
            class="paper-editor-image-grid__item"
            :class="{
              'paper-editor-image-grid__item--active':
                selectedImageAttrs?.src === img.src,
            }"
            :title="img.blockId ? 'Go to image' : 'Insert again'"
            @click="onDocImageClick(img.src, img.blockId)"
          >
            <img :src="safeImageUrl(img.src)" alt="" loading="lazy" />
          </button>
        </div>
      </section>

      <section
        v-if="isShapeSelected"
        class="paper-editor-tab__block paper-editor-tab__block--highlight"
      >
        <h4 class="paper-editor-tab__label">Selected shape</h4>
        <div class="paper-editor-panel__tool-row paper-editor-panel__size-row">
          <span class="paper-editor-panel__control-label">Size</span>
          <PaperFormatPresetMenu
            :model-value="currentShapeSize"
            :options="shapeSizeOptions"
            :paper-appearance="context.appearance.value"
            trigger-mode="label"
            placement="below"
            title="Shape size"
            @update:model-value="setShapeSize"
          />
        </div>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Position</span>
          <EchoDropdown
            :model-value="currentShapeAlign"
            :options="shapeAlignOptions"
            label="Position"
            compact
            @update:model-value="setShapeAlign"
          />
        </div>
        <p class="paper-editor-tab__hint">
          Drag the handles on the canvas to resize, or change fill in Colors →
          Objects.
        </p>
        <span
          v-if="selectedShapeAttrs"
          class="paper-editor-shape-preview-chip"
          :class="`paper-editor-shape-preview-chip--${selectedShapeAttrs.shape}`"
          :style="{
            backgroundColor: String(selectedShapeAttrs.fill ?? '#3b82f6'),
            width: String(selectedShapeAttrs.width ?? '48px'),
            height: String(selectedShapeAttrs.height ?? '48px'),
          }"
          aria-hidden="true"
        />
      </section>

      <section
        v-if="isImageSelected"
        class="paper-editor-tab__block paper-editor-tab__block--highlight"
      >
        <h4 class="paper-editor-tab__label">Selected image</h4>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Width</span>
          <EchoDropdown
            :model-value="currentWidth"
            :options="widthOptions"
            label="Width"
            compact
            @update:model-value="setImageWidth"
          />
        </div>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Align</span>
          <EchoDropdown
            :model-value="currentAlign"
            :options="alignOptions"
            label="Align"
            compact
            @update:model-value="setImageAlign"
          />
        </div>
        <div class="paper-editor-panel__tool-row">
          <span class="paper-editor-panel__control-label">Wrap</span>
          <EchoDropdown
            :model-value="currentWrap"
            :options="wrapOptions"
            label="Wrap"
            compact
            @update:model-value="setImageWrap"
          />
        </div>
        <p v-if="selectedImageAttrs?.src" class="paper-editor-tab__hint">
          <img
            :src="safeImageUrl(selectedImageAttrs.src)"
            alt="Selected"
            class="paper-editor-selected-preview"
          />
        </p>
      </section>
    </template>

    <p v-else class="paper-editor-tab__hint paper-editor-tab__hint--center">
      Switch to edit mode to add images.
    </p>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      class="hidden"
      @change="onImageFileChange"
    />

    <PaperPromptDialog
      :open="imageUrlDialogOpen"
      title="Image from URL"
      label="Image URL"
      placeholder="https://"
      :error="imageUrlError"
      @confirm="onImageUrlConfirm"
      @cancel="
        imageUrlDialogOpen = false;
        imageUrlError = null;
      "
    />
  </div>
</template>

<style scoped>
.paper-editor-shape-preview-chip {
  display: inline-block;
  margin-top: 0.5rem;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.paper-editor-shape-preview-chip--circle {
  border-radius: 50%;
}

.paper-editor-shape-preview-chip--triangle {
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

.paper-editor-shape-preview-chip--line {
  border-radius: 9999px;
}
</style>
