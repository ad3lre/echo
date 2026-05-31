import { computed, ref, watch, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  deleteEchoServerCustomEmoji,
  ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN,
  fetchEchoServerEmojiLibrary,
  postEchoCreateCustomEmojiPack,
  postEchoServerCustomEmoji,
  uploadServerEmojiObject,
  type EchoEmojiLibraryPackApi,
} from '@/api/echoClient';
import {
  invalidateServerStickerLibraryCache,
  useServerStickerLibrary,
} from '@/composables/useServerStickerLibrary';

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return readAsDataUrl(file);
}

function isEchoObjectStorageNotConfiguredError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return m.includes('echo_s3') || m.includes('uploads_not_configured');
}

const MAX_STICKER_PACKS = 6;
const MAX_STICKERS_PER_PACK = 64;
const MAX_STICKER_UPLOAD_BYTES = 512 * 1024;
const MAX_STICKER_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_STICKER_IMAGE_URL_CHARS = 600_000;

export type StickerUploadFeedbackTone = 'success' | 'error' | 'info';
export interface StickerUploadFeedback {
  tone: StickerUploadFeedbackTone;
  message: string;
}

const STICKER_MIME = new Set(['image/png', 'image/gif', 'image/apng']);

function stickerFormatFromFile(file: File): {
  format: 'png' | 'gif' | 'apng';
  animated: boolean;
} {
  const t = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (t === 'image/gif' || name.endsWith('.gif')) {
    return { format: 'gif', animated: true };
  }
  if (t === 'image/apng' || name.endsWith('.apng')) {
    return { format: 'apng', animated: true };
  }
  return { format: 'png', animated: false };
}

function isStickerFile(file: File): boolean {
  const t = file.type.toLowerCase();
  if (STICKER_MIME.has(t)) return true;
  const n = file.name.toLowerCase();
  return n.endsWith('.png') || n.endsWith('.gif') || n.endsWith('.apng');
}

export function useServerSettingsStickers(serverId: Ref<string | undefined>) {
  const auth = useAuthSessionStore();
  const stickerLibrary = useServerStickerLibrary(serverId);
  const customPacks = ref<EchoEmojiLibraryPackApi[]>([]);
  const customPacksLoading = ref(false);
  const selectedPackId = ref('');
  const stickerUploadFeedback = ref<StickerUploadFeedback | null>(null);

  const canCreateMorePacks = computed(
    () => customPacks.value.length < MAX_STICKER_PACKS,
  );

  const selectedPack = computed(
    () => customPacks.value.find((p) => p.id === selectedPackId.value) ?? null,
  );

  const stickerCountInSelectedPack = computed(() => {
    const packId = selectedPackId.value;
    if (!packId) return 0;
    let n = 0;
    for (const p of stickerLibrary.packs.value) {
      if (p.id === packId) n += p.stickers.length;
    }
    return n;
  });

  const canUploadToSelectedPack = computed(
    () =>
      !!selectedPack.value &&
      selectedPack.value.source === 'custom' &&
      stickerCountInSelectedPack.value < MAX_STICKERS_PER_PACK,
  );

  async function refreshCustomPacks() {
    if (echoSyncCapabilities.isMockDataMode) {
      customPacks.value = [];
      return;
    }
    const sid = serverId.value?.trim();
    if (!sid || !auth.isAuthenticated) {
      customPacks.value = [];
      return;
    }
    customPacksLoading.value = true;
    try {
      const res = await fetchEchoServerEmojiLibrary(
        auth.accessToken ?? '',
        sid,
      );
      customPacks.value = (res.packs ?? []).filter(
        (p) => p.source === 'custom',
      );
      if (
        selectedPackId.value &&
        !customPacks.value.some((p) => p.id === selectedPackId.value)
      ) {
        selectedPackId.value = customPacks.value[0]?.id ?? '';
      } else if (!selectedPackId.value) {
        selectedPackId.value = customPacks.value[0]?.id ?? '';
      }
    } catch {
      customPacks.value = [];
    } finally {
      customPacksLoading.value = false;
    }
  }

  watch(
    () => [serverId.value, auth.isAuthenticated] as const,
    () => {
      void refreshCustomPacks();
    },
    { immediate: true },
  );

  async function createStickerPack() {
    stickerUploadFeedback.value = null;
    if (!canCreateMorePacks.value) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: `Maximum ${MAX_STICKER_PACKS} custom packs.`,
      };
      return;
    }
    const sid = serverId.value?.trim();
    if (!sid || !auth.isAuthenticated) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'Sign in to create a sticker pack.',
      };
      return;
    }
    if (echoSyncCapabilities.isMockDataMode) {
      stickerUploadFeedback.value = {
        tone: 'info',
        message: 'Sticker packs are not available in mock mode.',
      };
      return;
    }
    try {
      const { packId } = await postEchoCreateCustomEmojiPack(
        auth.accessToken ?? '',
        sid,
        {
          name: 'Sticker pack',
          description: 'Custom server stickers for the composer emoji picker.',
          marketSettings: { tags: ['stickers'] },
          listedInMarket: false,
        },
      );
      await refreshCustomPacks();
      selectedPackId.value = packId;
      stickerUploadFeedback.value = {
        tone: 'success',
        message: 'Sticker pack created. Upload PNG, APNG, or GIF stickers.',
      };
    } catch (e) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: e instanceof Error ? e.message : 'Could not create pack',
      };
    }
  }

  async function onStickerUploadFile(file: File) {
    stickerUploadFeedback.value = null;
    if (!file) return;
    if (!isStickerFile(file)) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'Use PNG, APNG, or GIF stickers only.',
      };
      return;
    }
    if (!serverId.value?.trim()) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'Select a server before uploading stickers.',
      };
      return;
    }
    if (file.size > MAX_STICKER_INPUT_BYTES) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'File too large. Max input size is 8MB.',
      };
      return;
    }
    if (!selectedPack.value || selectedPack.value.source !== 'custom') {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'Select a custom pack before uploading.',
      };
      return;
    }
    if (!canUploadToSelectedPack.value) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: `Pack is full (${MAX_STICKERS_PER_PACK} stickers max).`,
      };
      return;
    }

    const { format, animated } = stickerFormatFromFile(file);
    if (file.size > MAX_STICKER_UPLOAD_BYTES && format === 'png') {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'PNG stickers must be 512KB or smaller.',
      };
      return;
    }
    if (file.size > MAX_STICKER_UPLOAD_BYTES) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'Sticker must be 512KB or smaller.',
      };
      return;
    }

    const baseName = (file.name || 'sticker')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
    const name = baseName || 'sticker';

    if (echoSyncCapabilities.isMockDataMode) {
      stickerUploadFeedback.value = {
        tone: 'info',
        message: 'Sticker upload is not available in mock mode.',
      };
      return;
    }

    const sid = serverId.value!.trim();
    const token = auth.accessToken;
    const packId = selectedPack.value.id;
    if (!token) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: 'Not signed in.',
      };
      return;
    }

    try {
      let imageUrl: string;
      try {
        imageUrl = await uploadServerEmojiObject(token, sid, file);
      } catch (e) {
        if (!isEchoObjectStorageNotConfiguredError(e)) {
          stickerUploadFeedback.value = {
            tone: 'error',
            message: e instanceof Error ? e.message : 'Upload failed',
          };
          return;
        }
        imageUrl = await fileToDataUrl(file);
        if (imageUrl.length > MAX_STICKER_IMAGE_URL_CHARS) {
          stickerUploadFeedback.value = {
            tone: 'error',
            message:
              'Image is too large to store without object storage. Configure ECHO_S3_* or use a smaller file.',
          };
          return;
        }
      }

      await postEchoServerCustomEmoji(token, sid, packId, {
        name,
        animated,
        imageUrl,
        expressionKind: 'sticker',
        stickerFormat: format,
      });
      invalidateServerStickerLibraryCache(sid);
      await stickerLibrary.refresh();
      await refreshCustomPacks();
      stickerUploadFeedback.value = {
        tone: 'success',
        message: `Uploaded :${name}:`,
      };
    } catch (e) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: e instanceof Error ? e.message : 'Upload failed',
      };
    }
  }

  async function onStickerUploadFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await onStickerUploadFile(file);
    input.value = '';
  }

  async function removeSticker(packId: string, stickerId: string) {
    stickerUploadFeedback.value = null;
    const sid = serverId.value?.trim();
    if (!sid || !auth.isAuthenticated) return;
    if (echoSyncCapabilities.isMockDataMode) return;
    try {
      await deleteEchoServerCustomEmoji(
        auth.accessToken ?? '',
        sid,
        packId,
        stickerId,
      );
      invalidateServerStickerLibraryCache(sid);
      await stickerLibrary.refresh();
      await refreshCustomPacks();
      stickerUploadFeedback.value = {
        tone: 'success',
        message: 'Sticker removed.',
      };
    } catch (e) {
      stickerUploadFeedback.value = {
        tone: 'error',
        message: e instanceof Error ? e.message : 'Could not remove sticker',
      };
    }
  }

  return {
    ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN,
    MAX_STICKER_PACKS,
    packs: stickerLibrary.packs,
    loading: stickerLibrary.loading,
    error: stickerLibrary.error,
    refresh: stickerLibrary.refresh,
    flatStickers: stickerLibrary.flatStickers,
    customPacks,
    customPacksLoading,
    selectedPackId,
    selectedPack,
    stickerUploadFeedback,
    canCreateMorePacks,
    canUploadToSelectedPack,
    createStickerPack,
    onStickerUploadFile,
    onStickerUploadFileChange,
    removeSticker,
    refreshCustomPacks,
  };
}
