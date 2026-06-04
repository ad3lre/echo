/**
 * Manages pending images, videos, audio, documents, and GIFs for the chat input.
 */

import { ref, computed } from 'vue';
import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';
import {
  probeVideoBlobUrl,
  probeVideoDimensionsOnly,
} from '@/utils/captureVideoFrame';
import { sha256HexOfBlob } from '@/utils/uploadFingerprint';

const pendingVideoSha256Jobs = new WeakMap<File, Promise<string>>();

function startPendingVideoSha256(file: File): Promise<string> {
  let job = pendingVideoSha256Jobs.get(file);
  if (!job) {
    job = sha256HexOfBlob(file);
    pendingVideoSha256Jobs.set(file, job);
  }
  return job;
}

export interface PendingImage {
  url: string;
  file: File;
  spoiler: boolean;
}

export interface PendingGif {
  url: string;
  spoiler: boolean;
}

/** Remote image URL (e.g. stock photo) — sent as `kind: image` without upload. */
export interface PendingExternalImage {
  url: string;
  spoiler: boolean;
}

export type PendingVideoUploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export interface PendingVideo {
  url: string;
  file: File;
  spoiler: boolean;
  /** Channel where the file was attached — scopes eager upload. */
  attachChannelId?: string;
  /** Still frame (~1s) for instant composer preview. */
  previewFrameUrl?: string;
  /** Locked once known — prevents preview aspect-ratio flicker. */
  aspectRatio?: string;
  width?: number;
  height?: number;
  uploadStatus?: PendingVideoUploadStatus;
  uploadPercent?: number | null;
  /** Precomputed while attached — skips re-hash at upload time. */
  sha256Hex?: string;
  uploadUrl?: string;
  uploadStorageKey?: string;
}

export interface PendingAudio {
  url: string;
  file: File;
  spoiler: boolean;
}

export interface PendingDocument {
  url: string;
  file: File;
  spoiler: boolean;
}

export function usePendingMedia() {
  const pendingImages = ref<PendingImage[]>([]);
  const pendingVideos = ref<PendingVideo[]>([]);
  const pendingAudios = ref<PendingAudio[]>([]);
  const pendingDocuments = ref<PendingDocument[]>([]);
  const pendingGifs = ref<PendingGif[]>([]);
  const pendingExternalImages = ref<PendingExternalImage[]>([]);

  function addFiles(files: File[], attachChannelId?: string) {
    const channel = attachChannelId?.trim() || undefined;
    const imageFiles: File[] = [];
    const videoFiles: File[] = [];
    const audioFiles: File[] = [];
    const documentFiles: File[] = [];
    for (const f of files) {
      const kind = inferChatPendingMediaKind(f);
      if (kind === 'image') imageFiles.push(f);
      else if (kind === 'video') videoFiles.push(f);
      else if (kind === 'document') documentFiles.push(f);
      else if (kind === 'audio') audioFiles.push(f);
    }
    const newPending = imageFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
    }));
    const newPendingVideos: PendingVideo[] = videoFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
      attachChannelId: channel,
      uploadStatus: 'idle' as const,
      uploadPercent: null,
    }));
    for (const entry of newPendingVideos) {
      void enrichPendingVideoPreview(entry);
      void startPendingVideoSha256(entry.file).then((sha256Hex) => {
        entry.sha256Hex = sha256Hex;
      });
    }
    const newPendingAudios = audioFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
    }));
    const newPendingDocuments = documentFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
    }));
    pendingImages.value = [...pendingImages.value, ...newPending];
    pendingVideos.value = [...pendingVideos.value, ...newPendingVideos];
    pendingAudios.value = [...pendingAudios.value, ...newPendingAudios];
    pendingDocuments.value = [
      ...pendingDocuments.value,
      ...newPendingDocuments,
    ];
  }

  function addGif(url: string) {
    pendingGifs.value = [...pendingGifs.value, { url, spoiler: false }];
  }

  function addExternalImageUrl(url: string) {
    pendingExternalImages.value = [
      ...pendingExternalImages.value,
      { url, spoiler: false },
    ];
  }

  function toggleImageSpoiler(index: number) {
    const item = pendingImages.value[index];
    if (item) item.spoiler = !item.spoiler;
  }

  function toggleGifSpoiler(index: number) {
    const item = pendingGifs.value[index];
    if (item) item.spoiler = !item.spoiler;
  }

  function toggleExternalImageSpoiler(index: number) {
    const item = pendingExternalImages.value[index];
    if (item) item.spoiler = !item.spoiler;
  }

  function toggleVideoSpoiler(index: number) {
    const item = pendingVideos.value[index];
    if (item) item.spoiler = !item.spoiler;
  }

  function toggleAudioSpoiler(index: number) {
    const item = pendingAudios.value[index];
    if (item) item.spoiler = !item.spoiler;
  }

  function toggleDocumentSpoiler(index: number) {
    const item = pendingDocuments.value[index];
    if (item) item.spoiler = !item.spoiler;
  }

  const allSpoilers = computed(() => {
    const imgs = pendingImages.value;
    const vids = pendingVideos.value;
    const auds = pendingAudios.value;
    const docs = pendingDocuments.value;
    const gs = pendingGifs.value;
    const ext = pendingExternalImages.value;
    if (
      imgs.length === 0 &&
      vids.length === 0 &&
      auds.length === 0 &&
      docs.length === 0 &&
      gs.length === 0 &&
      ext.length === 0
    )
      return false;
    const allImgSpoiled = imgs.length === 0 || imgs.every((p) => p.spoiler);
    const allVideoSpoiled = vids.length === 0 || vids.every((p) => p.spoiler);
    const allAudioSpoiled = auds.length === 0 || auds.every((p) => p.spoiler);
    const allDocSpoiled = docs.length === 0 || docs.every((p) => p.spoiler);
    const allGifSpoiled = gs.length === 0 || gs.every((g) => g.spoiler);
    const allExtSpoiled = ext.length === 0 || ext.every((x) => x.spoiler);
    return (
      allImgSpoiled &&
      allVideoSpoiled &&
      allAudioSpoiled &&
      allDocSpoiled &&
      allGifSpoiled &&
      allExtSpoiled
    );
  });

  function toggleAllSpoilers() {
    const spoil = !allSpoilers.value;
    pendingImages.value.forEach((p) => (p.spoiler = spoil));
    pendingVideos.value.forEach((p) => (p.spoiler = spoil));
    pendingAudios.value.forEach((p) => (p.spoiler = spoil));
    pendingDocuments.value.forEach((p) => (p.spoiler = spoil));
    pendingGifs.value.forEach((g) => (g.spoiler = spoil));
    pendingExternalImages.value.forEach((x) => (x.spoiler = spoil));
  }

  function removeImage(index: number) {
    const item = pendingImages.value[index];
    if (item) URL.revokeObjectURL(item.url);
    pendingImages.value = pendingImages.value.filter((_, i) => i !== index);
  }

  function removeGif(index: number) {
    pendingGifs.value = pendingGifs.value.filter((_, i) => i !== index);
  }

  function removeExternalImage(index: number) {
    pendingExternalImages.value = pendingExternalImages.value.filter(
      (_, i) => i !== index,
    );
  }

  function removeVideo(index: number) {
    const item = pendingVideos.value[index];
    if (item) {
      URL.revokeObjectURL(item.url);
      if (item.previewFrameUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewFrameUrl);
      }
    }
    pendingVideos.value = pendingVideos.value.filter((_, i) => i !== index);
  }

  async function enrichPendingVideoPreview(entry: PendingVideo): Promise<void> {
    const dims = await probeVideoDimensionsOnly(entry.url);
    if (dims) {
      entry.aspectRatio = dims.aspectRatio;
      entry.width = dims.width;
      entry.height = dims.height;
    }
    const probe = await probeVideoBlobUrl(entry.url);
    if (!probe) return;
    entry.previewFrameUrl = probe.frameUrl;
    entry.aspectRatio = probe.aspectRatio;
    entry.width = probe.width;
    entry.height = probe.height;
  }

  function removeAudio(index: number) {
    const item = pendingAudios.value[index];
    if (item) URL.revokeObjectURL(item.url);
    pendingAudios.value = pendingAudios.value.filter((_, i) => i !== index);
  }

  function removeDocument(index: number) {
    const item = pendingDocuments.value[index];
    if (item) URL.revokeObjectURL(item.url);
    pendingDocuments.value = pendingDocuments.value.filter(
      (_, i) => i !== index,
    );
  }

  function clearAll(options?: { revokeObjectUrls?: boolean }) {
    const revoke = options?.revokeObjectUrls !== false;
    if (revoke) {
      pendingImages.value.forEach((p) => URL.revokeObjectURL(p.url));
      pendingVideos.value.forEach((p) => {
        URL.revokeObjectURL(p.url);
        if (p.previewFrameUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(p.previewFrameUrl);
        }
      });
      pendingAudios.value.forEach((p) => URL.revokeObjectURL(p.url));
      pendingDocuments.value.forEach((p) => URL.revokeObjectURL(p.url));
    }
    pendingImages.value = [];
    pendingVideos.value = [];
    pendingAudios.value = [];
    pendingDocuments.value = [];
    pendingGifs.value = [];
    pendingExternalImages.value = [];
  }

  return {
    pendingImages,
    pendingVideos,
    pendingAudios,
    pendingDocuments,
    pendingGifs,
    pendingExternalImages,
    addFiles,
    addGif,
    addExternalImageUrl,
    toggleImageSpoiler,
    toggleVideoSpoiler,
    toggleAudioSpoiler,
    toggleDocumentSpoiler,
    toggleGifSpoiler,
    toggleExternalImageSpoiler,
    toggleAllSpoilers,
    allSpoilers,
    removeImage,
    removeVideo,
    removeAudio,
    removeDocument,
    removeGif,
    removeExternalImage,
    clearAll,
  };
}
