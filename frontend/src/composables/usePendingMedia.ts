/**
 * Manages pending images, videos, and GIFs for the chat input.
 */

import { ref, computed } from 'vue';
import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';

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

export interface PendingVideo {
  url: string;
  file: File;
  spoiler: boolean;
}

export interface PendingAudio {
  url: string;
  file: File;
  spoiler: boolean;
}

export function usePendingMedia() {
  const pendingImages = ref<PendingImage[]>([]);
  const pendingVideos = ref<PendingVideo[]>([]);
  const pendingAudios = ref<PendingAudio[]>([]);
  const pendingGifs = ref<PendingGif[]>([]);
  const pendingExternalImages = ref<PendingExternalImage[]>([]);

  function addFiles(files: File[]) {
    const imageFiles: File[] = [];
    const videoFiles: File[] = [];
    const audioFiles: File[] = [];
    for (const f of files) {
      const kind = inferChatPendingMediaKind(f);
      if (kind === 'image') imageFiles.push(f);
      else if (kind === 'video') videoFiles.push(f);
      else if (kind === 'audio') audioFiles.push(f);
    }
    const newPending = imageFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
    }));
    const newPendingVideos = videoFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
    }));
    const newPendingAudios = audioFiles.map((file) => ({
      url: URL.createObjectURL(file),
      file,
      spoiler: false,
    }));
    pendingImages.value = [...pendingImages.value, ...newPending];
    pendingVideos.value = [...pendingVideos.value, ...newPendingVideos];
    pendingAudios.value = [...pendingAudios.value, ...newPendingAudios];
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

  const allSpoilers = computed(() => {
    const imgs = pendingImages.value;
    const vids = pendingVideos.value;
    const auds = pendingAudios.value;
    const gs = pendingGifs.value;
    const ext = pendingExternalImages.value;
    if (
      imgs.length === 0 &&
      vids.length === 0 &&
      auds.length === 0 &&
      gs.length === 0 &&
      ext.length === 0
    )
      return false;
    const allImgSpoiled = imgs.length === 0 || imgs.every((p) => p.spoiler);
    const allVideoSpoiled = vids.length === 0 || vids.every((p) => p.spoiler);
    const allAudioSpoiled = auds.length === 0 || auds.every((p) => p.spoiler);
    const allGifSpoiled = gs.length === 0 || gs.every((g) => g.spoiler);
    const allExtSpoiled = ext.length === 0 || ext.every((x) => x.spoiler);
    return (
      allImgSpoiled &&
      allVideoSpoiled &&
      allAudioSpoiled &&
      allGifSpoiled &&
      allExtSpoiled
    );
  });

  function toggleAllSpoilers() {
    const spoil = !allSpoilers.value;
    pendingImages.value.forEach((p) => (p.spoiler = spoil));
    pendingVideos.value.forEach((p) => (p.spoiler = spoil));
    pendingAudios.value.forEach((p) => (p.spoiler = spoil));
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
    if (item) URL.revokeObjectURL(item.url);
    pendingVideos.value = pendingVideos.value.filter((_, i) => i !== index);
  }

  function removeAudio(index: number) {
    const item = pendingAudios.value[index];
    if (item) URL.revokeObjectURL(item.url);
    pendingAudios.value = pendingAudios.value.filter((_, i) => i !== index);
  }

  function clearAll() {
    pendingImages.value.forEach((p) => URL.revokeObjectURL(p.url));
    pendingVideos.value.forEach((p) => URL.revokeObjectURL(p.url));
    pendingAudios.value.forEach((p) => URL.revokeObjectURL(p.url));
    pendingImages.value = [];
    pendingVideos.value = [];
    pendingAudios.value = [];
    pendingGifs.value = [];
    pendingExternalImages.value = [];
  }

  return {
    pendingImages,
    pendingVideos,
    pendingAudios,
    pendingGifs,
    pendingExternalImages,
    addFiles,
    addGif,
    addExternalImageUrl,
    toggleImageSpoiler,
    toggleVideoSpoiler,
    toggleAudioSpoiler,
    toggleGifSpoiler,
    toggleExternalImageSpoiler,
    toggleAllSpoilers,
    allSpoilers,
    removeImage,
    removeVideo,
    removeAudio,
    removeGif,
    removeExternalImage,
    clearAll,
  };
}
