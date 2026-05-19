<script setup lang="ts">
import type {
  PendingImage,
  PendingGif,
  PendingExternalImage,
  PendingVideo,
  PendingAudio,
  PendingDocument,
} from '@/composables/usePendingMedia';
import PdfFirstPagePreview from './PdfFirstPagePreview.vue';

defineProps<{
  images: PendingImage[];
  videos: PendingVideo[];
  audios: PendingAudio[];
  documents: PendingDocument[];
  externalImages: PendingExternalImage[];
  gifs: PendingGif[];
}>();

const emit = defineEmits<{
  removeImage: [index: number];
  removeVideo: [index: number];
  removeAudio: [index: number];
  removeDocument: [index: number];
  removeExternalImage: [index: number];
  removeGif: [index: number];
  /** Open fullscreen image viewer; index is which pending image to show first. */
  previewImages: [startIndex: number];
}>();

function isPdfPending(doc: PendingDocument): boolean {
  return doc.file.name.toLowerCase().endsWith('.pdf');
}
</script>

<template>
  <div
    v-if="
      images.length > 0 ||
      videos.length > 0 ||
      audios.length > 0 ||
      documents.length > 0 ||
      externalImages.length > 0 ||
      gifs.length > 0
    "
    class="mb-2 flex flex-wrap gap-2 rounded-lg bg-scrim-2 p-2 backdrop-blur-md"
  >
    <button
      v-if="images.length > 0"
      type="button"
      class="chat-focus-ring flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-glass-1 text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
      title="Preview images"
      aria-label="Preview images larger"
      @click="emit('previewImages', 0)"
    >
      <svg
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.75"
          d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
        />
      </svg>
      <span class="text-[9px] font-semibold uppercase tracking-wide">View</span>
    </button>
    <div
      v-for="(img, i) in images"
      :key="'img-' + img.url"
      class="group relative flex h-16 max-w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
      :class="{ 'ring-2 ring-amber-500/70': img.spoiler }"
    >
      <img
        :src="img.url"
        :alt="img.file.name"
        :class="img.spoiler ? 'blur-md' : ''"
        class="max-h-16 max-w-full object-contain"
      />
      <button
        class="chat-focus-ring absolute inset-0 flex items-center justify-center rounded-lg bg-scrim-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Remove"
        @click="emit('removeImage', i)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg transition-colors hover:bg-red-500"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      </button>
    </div>
    <div
      v-for="(video, i) in videos"
      :key="'video-' + video.url"
      class="group relative flex h-16 max-w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
      :class="{ 'ring-2 ring-amber-500/70': video.spoiler }"
    >
      <video
        :src="video.url"
        muted
        playsinline
        preload="metadata"
        :class="video.spoiler ? 'blur-md' : ''"
        class="max-h-16 max-w-full object-contain"
      />
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1 pt-3"
      >
        <div
          class="rounded bg-scrim-2 px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-fg-soft"
        >
          Video
        </div>
      </div>
      <button
        class="chat-focus-ring absolute inset-0 flex items-center justify-center rounded-lg bg-scrim-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Remove"
        @click="emit('removeVideo', i)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg transition-colors hover:bg-red-500"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      </button>
    </div>
    <div
      v-for="(audio, i) in audios"
      :key="'audio-' + audio.url"
      class="group relative h-16 w-40 shrink-0 overflow-hidden rounded-lg border border-border px-2 py-1.5"
      :class="{ 'ring-2 ring-amber-500/70': audio.spoiler }"
    >
      <div class="flex h-full items-center gap-2">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-md bg-glass-2 text-fg-soft"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19V6l12-2v13"
            />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <div
            class="truncate text-[11px] font-semibold text-fg-soft"
            :class="audio.spoiler ? 'blur-[2px]' : ''"
            :title="audio.file.name"
          >
            {{ audio.file.name }}
          </div>
          <div
            class="mt-0.5 text-[10px] uppercase tracking-wide text-fg-subtle"
          >
            Audio
          </div>
        </div>
      </div>
      <button
        class="chat-focus-ring absolute inset-0 flex items-center justify-center rounded-lg bg-scrim-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Remove"
        @click="emit('removeAudio', i)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg transition-colors hover:bg-red-500"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      </button>
    </div>
    <div
      v-for="(doc, i) in documents"
      :key="'doc-' + doc.url"
      class="group relative flex max-w-md min-w-0 shrink-0 items-stretch overflow-hidden rounded-lg border border-border"
      :class="{ 'ring-2 ring-amber-500/70': doc.spoiler }"
    >
      <div
        class="flex min-w-0 flex-1 items-stretch gap-2 px-2 py-1.5"
        :class="isPdfPending(doc) ? 'min-h-[120px]' : 'h-16 items-center'"
      >
        <PdfFirstPagePreview
          v-if="isPdfPending(doc)"
          :src="doc.url"
          :spoiler="doc.spoiler"
        />
        <div
          v-else
          class="flex shrink-0 flex-col items-center justify-center rounded-md bg-glass-2 px-1 text-[9px] font-bold uppercase leading-tight text-fg-soft"
        >
          <span>DOC</span>
        </div>
        <div class="flex min-w-0 flex-1 flex-col justify-center py-1 pr-1">
          <div
            class="truncate text-[11px] font-semibold text-fg-soft"
            :class="doc.spoiler ? 'blur-[2px]' : ''"
            :title="doc.file.name"
          >
            {{ doc.file.name }}
          </div>
          <div
            class="mt-0.5 text-[10px] uppercase tracking-wide text-fg-subtle"
          >
            {{ isPdfPending(doc) ? 'PDF' : 'Document' }}
          </div>
        </div>
      </div>
      <button
        class="chat-focus-ring absolute inset-0 flex items-center justify-center rounded-lg bg-scrim-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Remove"
        @click="emit('removeDocument', i)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg transition-colors hover:bg-red-500"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      </button>
    </div>
    <div
      v-for="(photo, i) in externalImages"
      :key="'extimg-' + i + '-' + photo.url"
      class="group relative flex h-16 max-w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
      :class="{ 'ring-2 ring-amber-500/70': photo.spoiler }"
    >
      <img
        :src="photo.url"
        alt="Image"
        :class="photo.spoiler ? 'blur-md' : ''"
        class="max-h-16 max-w-full object-contain"
      />
      <button
        class="chat-focus-ring absolute inset-0 flex items-center justify-center rounded-lg bg-scrim-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Remove"
        @click="emit('removeExternalImage', i)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg transition-colors hover:bg-red-500"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      </button>
    </div>
    <div
      v-for="(gif, i) in gifs"
      :key="'gif-' + i + '-' + gif.url"
      class="group relative flex h-16 max-w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
      :class="{ 'ring-2 ring-amber-500/70': gif.spoiler }"
    >
      <img
        :src="gif.url"
        alt="GIF"
        :class="gif.spoiler ? 'blur-md' : ''"
        class="max-h-16 max-w-full object-contain"
      />
      <button
        class="chat-focus-ring absolute inset-0 flex items-center justify-center rounded-lg bg-scrim-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label="Remove"
        @click="emit('removeGif', i)"
      >
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white shadow-lg transition-colors hover:bg-red-500"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      </button>
    </div>
  </div>
</template>
