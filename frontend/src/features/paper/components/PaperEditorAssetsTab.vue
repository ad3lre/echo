<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PaperEditorPanelBridgeContext } from '@/features/paper/composables/paperEditorPanelBridge';
import { extractPaperDocumentImages } from '@/features/paper/editor/extractPaperDocumentImages';
import { useImageSearch } from '@/composables/useImageSearch';
import PaperPromptDialog from '@/features/paper/components/PaperPromptDialog.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';

const props = defineProps<{
  context: PaperEditorPanelBridgeContext;
  editorEditable: boolean;
}>();

const editorRef = computed(() => props.context.editor.value);
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const imageUrlDialogOpen = ref(false);
const imageUrlError = ref<string | null>(null);
const searchQuery = ref('');

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
  fileInput.value?.click();
}

async function insertFiles(files: FileList | File[]) {
  const editor = editorRef.value;
  if (!editor) return;
  const list = Array.from(files);
  for (const file of list) {
    if (!file.type.startsWith('image/')) continue;
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
          @click="imageUrlDialogOpen = true"
        >
          Insert from URL…
        </button>
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
            :title="img.blockId ? 'Go to image' : 'Insert again'"
            @click="onDocImageClick(img.src, img.blockId)"
          >
            <img :src="safeImageUrl(img.src)" alt="" loading="lazy" />
          </button>
        </div>
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
