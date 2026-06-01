import { computed, ref, watch, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  deleteEchoServerCustomEmoji,
  ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN,
  fetchEchoEmojiMarketPacks,
  fetchEchoServerEmojiLibrary,
  patchEchoEmojiPackMeta,
  patchEchoServerCustomEmojiName,
  postEchoCreateCustomEmojiPack,
  postEchoImportMarketEmojiPack,
  postEchoServerCustomEmoji,
  uploadServerEmojiObject,
  type EchoEmojiLibraryPackApi,
  type EchoEmojiMarketPackApi,
} from '@/api/echoClient';
import {
  invalidateServerStickerLibraryCache,
  useServerStickerLibrary,
  type EchoStickerLibraryStickerApi,
} from '@/composables/useServerStickerLibrary';
import type { MessageStickerFormat } from '@shared/types';

export type EmojiKind = 'static' | 'animated';
export type EmojiPackSource = 'market' | 'custom';

export interface ManagedEmoji {
  id: string;
  name: string;
  kind: EmojiKind;
  previewUrl?: string;
  char?: string;
  used: number;
}

export interface ManagedSticker {
  id: string;
  name: string;
  format: MessageStickerFormat;
  previewUrl: string;
  used: number;
}

export interface ManagedEmojiPack {
  id: string;
  name: string;
  source: EmojiPackSource;
  description: string;
  /** When `source === 'market'`, Echo API pack row references this catalog id. */
  marketPackId?: string | null;
  listedInMarket?: boolean;
  marketSettings?: { tags: string[] };
  authorServerName?: string;
  totalUseCount?: number;
  emojis: ManagedEmoji[];
  stickers: ManagedSticker[];
}

function mapLibraryStickerToManaged(
  sticker: EchoStickerLibraryStickerApi,
): ManagedSticker {
  return {
    id: sticker.id,
    name: sticker.name,
    format: sticker.format,
    previewUrl: sticker.imageUrl,
    used: sticker.useCount ?? 0,
  };
}

function packExpressionCount(pack: ManagedEmojiPack): number {
  return pack.emojis.length + pack.stickers.length;
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

const MAX_STICKER_UPLOAD_BYTES = 512 * 1024;
const MAX_STICKER_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_STICKER_IMAGE_URL_CHARS = 600_000;
export type EmojiUploadFeedbackTone = 'success' | 'error' | 'info';
export interface EmojiUploadFeedback {
  tone: EmojiUploadFeedbackTone;
  message: string;
}

const MAX_EMOJI_PACKS = 6;
const MAX_EMOJIS_PER_PACK = 64;
// Keep uploads bounded, but prioritize visual quality over heavy compression.
const MAX_EMOJI_UPLOAD_BYTES = 512 * 1024;

/** Dedupe, lowercase, max 8 tags, 32 chars each — emoji pack market listing. */
export function normalizeEmojiPackTagList(source: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of source) {
    const t = raw.trim().toLowerCase().slice(0, 32);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

function mapEchoMarketPackToManaged(
  p: EchoEmojiMarketPackApi,
): ManagedEmojiPack {
  return {
    id: p.id,
    name: p.name,
    source: 'market',
    description: p.description,
    authorServerName: p.authorServerName,
    totalUseCount: p.totalUseCount ?? 0,
    marketSettings: p.marketSettings ?? { tags: [] },
    emojis: (p.emojis ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      char: e.char,
      previewUrl: e.previewUrl,
      used: 0,
    })),
    stickers: [],
  };
}

const FALLBACK_MOCK_SERVER_PACKS: ManagedEmojiPack[] = [
  {
    id: 'pack-house',
    name: 'House Pack',
    source: 'custom',
    description: 'Your server-owned emoji pack.',
    emojis: [
      { id: 'house-1', name: 'welcome', kind: 'static', char: '👋', used: 22 },
      { id: 'house-2', name: 'spark', kind: 'animated', char: '✨', used: 14 },
    ],
    stickers: [],
  },
  {
    id: 'pack-starter-social',
    name: 'Starter Social',
    source: 'market',
    description: 'Default social reactions for new servers.',
    emojis: [
      {
        id: 'starter-1',
        name: 'heart_react',
        kind: 'static',
        char: '💜',
        used: 0,
      },
      {
        id: 'starter-2',
        name: 'party_ping',
        kind: 'animated',
        char: '🎉',
        used: 0,
      },
      {
        id: 'starter-3',
        name: 'thinking_face',
        kind: 'static',
        char: '🤔',
        used: 0,
      },
    ],
    stickers: [],
  },
];

function mapLibraryPackToManaged(p: EchoEmojiLibraryPackApi): ManagedEmojiPack {
  const desc =
    p.description?.trim() ||
    (p.source === 'market' ? 'Imported from the Echo emoji market.' : '');
  return {
    id: p.id,
    name: p.name,
    source: p.source,
    marketPackId: p.marketPackId,
    description: desc,
    listedInMarket: p.listedInMarket ?? false,
    marketSettings: p.marketSettings ?? { tags: [] },
    emojis: p.emojis.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.animated ? 'animated' : 'static',
      previewUrl: e.imageUrl,
      used: e.useCount,
    })),
    stickers: [],
  };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return readAsDataUrl(file);
}

/** Backend `MAX_IMAGE_URL_LEN` — stay under when using inline `data:` URLs. */
const MAX_EMOJI_IMAGE_URL_CHARS = 590_000;

/**
 * Presign fails with 503 when `ECHO_S3_*` is unset; emoji POST still allows `data:` URLs in that mode
 * (`echoEmojiLibrary.ts` rejects `data:` only when object storage is configured).
 */
function isEchoObjectStorageNotConfiguredError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return m.includes('echo_s3') || m.includes('uploads_not_configured');
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageToLimit(
  file: File,
  maxBytes: number,
): Promise<File | null> {
  if (file.size <= maxBytes) return file;

  const img = await loadImage(file);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  if (!sourceWidth || !sourceHeight) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let bestBlob: Blob | null = null;
  // Prefer quality-first compression and only downscale gradually when required.
  const qualities = [0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72];

  for (let step = 0; step < 6; step += 1) {
    const scale = Math.pow(0.9, step);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (!blob) continue;
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= maxBytes) {
        const compressedName =
          file.name.replace(/\.[a-z0-9]+$/i, '') || 'emoji';
        return new File([blob], `${compressedName}.webp`, {
          type: 'image/webp',
        });
      }
    }
  }

  if (!bestBlob || bestBlob.size > maxBytes) return null;
  const fallbackName = file.name.replace(/\.[a-z0-9]+$/i, '') || 'emoji';
  return new File([bestBlob], `${fallbackName}.webp`, { type: 'image/webp' });
}

export function useServerSettingsEmoji(serverId: Ref<string | undefined>) {
  const auth = useAuthSessionStore();
  const stickerLibrary = useServerStickerLibrary(serverId);
  const emojiSearchQuery = ref('');
  const selectedEmojiPackId = ref<string>('');
  const selectedEmojiId = ref<string>('');
  const selectedStickerId = ref<string>('');
  const customEmojiPackName = ref('');
  const customEmojiPackDescription = ref('');
  const customEmojiPackTags = ref<string[]>([]);
  const customEmojiPackListedInMarket = ref(true);
  const emojiPackMarketSearch = ref('');
  const emojiPackModalOpen = ref(false);
  const emojiPackModalTab = ref<'create' | 'market'>('market');
  const emojiUploadFeedback = ref<EmojiUploadFeedback | null>(null);

  const marketEmojiPacks = ref<ManagedEmojiPack[]>([]);
  const marketEmojiPacksLoading = ref(false);
  const marketEmojiPacksError = ref<string | null>(null);
  const serverEmojiLibraryLoading = ref(false);
  const serverEmojiLibraryError = ref<string | null>(null);

  async function refreshMarketEmojiPacks() {
    if (echoSyncCapabilities.isMockDataMode) {
      marketEmojiPacks.value = [];
      marketEmojiPacksError.value = null;
      marketEmojiPacksLoading.value = false;
      return;
    }
    marketEmojiPacksLoading.value = true;
    marketEmojiPacksError.value = null;
    try {
      const { packs } = await fetchEchoEmojiMarketPacks();
      marketEmojiPacks.value = packs.map(mapEchoMarketPackToManaged);
    } catch (e) {
      marketEmojiPacksError.value =
        e instanceof Error ? e.message : 'Failed to load emoji market';
      marketEmojiPacks.value = [];
    } finally {
      marketEmojiPacksLoading.value = false;
    }
  }

  const serverEmojiPacks = ref<ManagedEmojiPack[]>(
    echoSyncCapabilities.isMockDataMode
      ? (JSON.parse(
          JSON.stringify(FALLBACK_MOCK_SERVER_PACKS),
        ) as ManagedEmojiPack[])
      : [],
  );

  function attachStickersToPacks(
    packs: ManagedEmojiPack[],
  ): ManagedEmojiPack[] {
    const stickersByPackId = new Map<string, ManagedSticker[]>();
    for (const pack of stickerLibrary.packs.value) {
      stickersByPackId.set(
        pack.id,
        pack.stickers.map(mapLibraryStickerToManaged),
      );
    }
    return packs.map((pack) => ({
      ...pack,
      stickers: stickersByPackId.get(pack.id) ?? [],
    }));
  }

  const serverEmojiPacksWithStickers = computed(() =>
    attachStickersToPacks(serverEmojiPacks.value),
  );

  async function refreshExpressionLibrary() {
    await Promise.all([refreshServerEmojiLibrary(), stickerLibrary.refresh()]);
  }

  async function refreshServerEmojiLibrary() {
    if (echoSyncCapabilities.isMockDataMode) {
      serverEmojiLibraryError.value = null;
      serverEmojiLibraryLoading.value = false;
      return;
    }
    const sid = serverId.value;
    const token = auth.accessToken;
    if (!sid || sid === 'echo' || !auth.isAuthenticated) {
      serverEmojiPacks.value = [];
      return;
    }
    serverEmojiLibraryLoading.value = true;
    serverEmojiLibraryError.value = null;
    try {
      const { packs } = await fetchEchoServerEmojiLibrary(token ?? '', sid);
      serverEmojiPacks.value = packs.map(mapLibraryPackToManaged);
    } catch (e) {
      serverEmojiLibraryError.value =
        e instanceof Error ? e.message : 'Failed to load server emoji';
      serverEmojiPacks.value = [];
    } finally {
      serverEmojiLibraryLoading.value = false;
    }
  }

  watch(
    () =>
      [
        echoSyncCapabilities.isMockDataMode,
        serverId.value,
        auth.isAuthenticated,
        auth.accessToken,
      ] as const,
    ([mock]) => {
      if (mock) {
        serverEmojiPacks.value = JSON.parse(
          JSON.stringify(FALLBACK_MOCK_SERVER_PACKS),
        ) as ManagedEmojiPack[];
        serverEmojiLibraryError.value = null;
        return;
      }
      void refreshServerEmojiLibrary();
    },
    { immediate: true },
  );

  const totalServerEmojis = computed(() =>
    serverEmojiPacksWithStickers.value.reduce(
      (sum, pack) => sum + packExpressionCount(pack),
      0,
    ),
  );
  const canImportMorePacks = computed(
    () => serverEmojiPacks.value.length < MAX_EMOJI_PACKS,
  );
  const selectedEmojiPack = computed(
    () =>
      serverEmojiPacksWithStickers.value.find(
        (pack) => pack.id === selectedEmojiPackId.value,
      ) ?? null,
  );
  const selectedEmoji = computed(
    () =>
      selectedEmojiPack.value?.emojis.find(
        (emoji) => emoji.id === selectedEmojiId.value,
      ) ?? null,
  );
  const selectedSticker = computed(
    () =>
      selectedEmojiPack.value?.stickers.find(
        (sticker) => sticker.id === selectedStickerId.value,
      ) ?? null,
  );
  const filteredPackEmojis = computed(() => {
    const q = emojiSearchQuery.value.trim().toLowerCase();
    const emojis = selectedEmojiPack.value?.emojis ?? [];
    return emojis
      .filter((emoji) =>
        !q
          ? true
          : emoji.name.toLowerCase().includes(q) ||
            (emoji.char ?? '').includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const filteredPackStickers = computed(() => {
    const q = emojiSearchQuery.value.trim().toLowerCase();
    const stickers = selectedEmojiPack.value?.stickers ?? [];
    return stickers
      .filter((sticker) => (!q ? true : sticker.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const filteredMarketEmojiPacks = computed(() => {
    const q = emojiPackMarketSearch.value.trim().toLowerCase();
    const importedOriginIds = new Set(
      serverEmojiPacks.value
        .map((pack) => pack.marketPackId)
        .filter((id): id is string => !!id),
    );
    return marketEmojiPacks.value
      .filter((pack) => !importedOriginIds.has(pack.id))
      .filter((pack) =>
        !q
          ? true
          : pack.name.toLowerCase().includes(q) ||
            pack.description.toLowerCase().includes(q),
      );
  });

  watch(
    () => [emojiPackModalOpen.value, emojiPackModalTab.value] as const,
    ([open, tab]) => {
      if (open && tab === 'market') void refreshMarketEmojiPacks();
    },
  );

  watch(
    serverEmojiPacksWithStickers,
    (next) => {
      if (!next.length) {
        selectedEmojiPackId.value = '';
        selectedEmojiId.value = '';
        selectedStickerId.value = '';
        return;
      }
      if (
        !selectedEmojiPackId.value ||
        !next.some((pack) => pack.id === selectedEmojiPackId.value)
      ) {
        selectedEmojiPackId.value = next[0]!.id;
      }
      const pack =
        next.find((item) => item.id === selectedEmojiPackId.value) ?? next[0]!;
      if (!packExpressionCount(pack)) {
        selectedEmojiId.value = '';
        selectedStickerId.value = '';
        return;
      }
      if (
        selectedEmojiId.value &&
        pack.emojis.some((emoji) => emoji.id === selectedEmojiId.value)
      ) {
        selectedStickerId.value = '';
        return;
      }
      if (
        selectedStickerId.value &&
        pack.stickers.some((sticker) => sticker.id === selectedStickerId.value)
      ) {
        selectedEmojiId.value = '';
        return;
      }
      selectedEmojiId.value = pack.emojis[0]?.id ?? '';
      selectedStickerId.value = selectedEmojiId.value
        ? ''
        : (pack.stickers[0]?.id ?? '');
    },
    { deep: true, immediate: true },
  );

  watch(
    selectedEmojiPackId,
    (packId) => {
      const pack = serverEmojiPacksWithStickers.value.find(
        (item) => item.id === packId,
      );
      selectedEmojiId.value = pack?.emojis[0]?.id ?? '';
      selectedStickerId.value = selectedEmojiId.value
        ? ''
        : (pack?.stickers[0]?.id ?? '');
    },
    { immediate: true },
  );

  async function createCustomEmojiPack() {
    if (!canImportMorePacks.value) return;
    const name = customEmojiPackName.value.trim() || 'My Emoji Pack';
    const description = customEmojiPackDescription.value.trim();
    if (description.length < ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: `Description must be at least ${ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN} characters.`,
      };
      return;
    }
    const marketSettings = {
      tags: normalizeEmojiPackTagList(customEmojiPackTags.value),
    };
    const listedInMarket = customEmojiPackListedInMarket.value;
    if (echoSyncCapabilities.isMockDataMode) {
      const pack: ManagedEmojiPack = {
        id: `pack-custom-${Date.now()}`,
        name,
        source: 'custom',
        description,
        listedInMarket,
        marketSettings,
        emojis: [],
        stickers: [],
      };
      serverEmojiPacks.value = [...serverEmojiPacks.value, pack];
      selectedEmojiPackId.value = pack.id;
      customEmojiPackName.value = '';
      customEmojiPackDescription.value = '';
      customEmojiPackTags.value = [];
      customEmojiPackListedInMarket.value = true;
      emojiPackModalOpen.value = false;
      return;
    }
    const sid = serverId.value;
    const token = auth.accessToken;
    if (!sid || !auth.isAuthenticated) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Sign in to create emoji packs.',
      };
      return;
    }
    try {
      const { packId } = await postEchoCreateCustomEmojiPack(token ?? '', sid, {
        name,
        description,
        marketSettings,
        listedInMarket,
      });
      customEmojiPackName.value = '';
      customEmojiPackDescription.value = '';
      customEmojiPackTags.value = [];
      customEmojiPackListedInMarket.value = true;
      emojiPackModalOpen.value = false;
      await refreshServerEmojiLibrary();
      selectedEmojiPackId.value = packId;
    } catch (e) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: e instanceof Error ? e.message : 'Could not create pack',
      };
    }
  }

  const packEditDescription = ref('');
  const packEditTags = ref<string[]>([]);
  const packEditListedInMarket = ref(true);

  watch(
    () => [selectedEmojiPackId.value, serverEmojiPacks.value] as const,
    () => {
      const pack = serverEmojiPacks.value.find(
        (p) => p.id === selectedEmojiPackId.value,
      );
      if (!pack || pack.source !== 'custom') {
        packEditDescription.value = '';
        packEditTags.value = [];
        packEditListedInMarket.value = true;
        return;
      }
      packEditDescription.value = pack.description ?? '';
      packEditTags.value = normalizeEmojiPackTagList(
        pack.marketSettings?.tags ?? [],
      );
      packEditListedInMarket.value = pack.listedInMarket ?? false;
    },
    { deep: true, immediate: true },
  );

  async function saveCustomPackMarketDetails() {
    const pack = selectedEmojiPack.value;
    if (!pack || pack.source !== 'custom') return;
    const description = packEditDescription.value.trim();
    if (description.length < ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: `Description must be at least ${ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN} characters.`,
      };
      return;
    }
    const marketSettings = {
      tags: normalizeEmojiPackTagList(packEditTags.value),
    };
    if (echoSyncCapabilities.isMockDataMode) {
      pack.description = description;
      pack.marketSettings = marketSettings;
      pack.listedInMarket = packEditListedInMarket.value;
      emojiUploadFeedback.value = {
        tone: 'success',
        message: 'Pack settings updated (local mock).',
      };
      return;
    }
    const sid = serverId.value;
    const token = auth.accessToken;
    if (!sid || !auth.isAuthenticated) return;
    try {
      await patchEchoEmojiPackMeta(token ?? '', sid, pack.id, {
        description,
        marketSettings,
        listedInMarket: packEditListedInMarket.value,
      });
      await refreshServerEmojiLibrary();
      emojiUploadFeedback.value = {
        tone: 'success',
        message: 'Pack settings saved.',
      };
    } catch (e) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message:
          e instanceof Error ? e.message : 'Could not save pack settings',
      };
    }
  }

  async function importMarketEmojiPack(packId: string) {
    if (!canImportMorePacks.value) return;
    if (echoSyncCapabilities.isMockDataMode) {
      const pack = marketEmojiPacks.value.find((item) => item.id === packId);
      if (!pack) return;
      const clone: ManagedEmojiPack = JSON.parse(
        JSON.stringify(pack),
      ) as ManagedEmojiPack;
      serverEmojiPacks.value = [...serverEmojiPacks.value, clone];
      selectedEmojiPackId.value = clone.id;
      emojiPackModalOpen.value = false;
      return;
    }
    const sid = serverId.value;
    const token = auth.accessToken;
    if (!sid || !auth.isAuthenticated) return;
    try {
      await postEchoImportMarketEmojiPack(token ?? '', sid, packId);
      emojiPackModalOpen.value = false;
      await refreshServerEmojiLibrary();
      const imported = serverEmojiPacks.value.find(
        (p) => p.marketPackId === packId,
      );
      if (imported) selectedEmojiPackId.value = imported.id;
    } catch (e) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: e instanceof Error ? e.message : 'Import failed',
      };
    }
  }

  async function onEmojiUploadFile(file: File) {
    emojiUploadFeedback.value = null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Invalid format. Please upload an image file.',
      };
      return;
    }
    if (!serverId.value) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Select a server before uploading emojis.',
      };
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'File too large. Max input size is 8MB.',
      };
      return;
    }
    if (
      !selectedEmojiPack.value ||
      selectedEmojiPack.value.source !== 'custom'
    ) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Upload is only available for custom packs.',
      };
      return;
    }
    if (
      selectedEmojiPack.value &&
      packExpressionCount(selectedEmojiPack.value) >= MAX_EMOJIS_PER_PACK
    ) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: `Pack is full (${MAX_EMOJIS_PER_PACK} expressions max).`,
      };
      return;
    }

    try {
      const processedFile = await compressImageToLimit(
        file,
        MAX_EMOJI_UPLOAD_BYTES,
      );
      if (!processedFile) {
        emojiUploadFeedback.value = {
          tone: 'error',
          message: 'Could not compress image to 256KB. Try a simpler image.',
        };
        return;
      }

      const baseName = (file.name || 'emoji')
        .replace(/\.[a-z0-9]+$/i, '')
        .trim();
      const name = baseName || 'emoji';
      const animated = processedFile.type.toLowerCase() === 'image/gif';

      if (!echoSyncCapabilities.isMockDataMode) {
        const sid = serverId.value;
        const token = auth.accessToken;
        const packId = selectedEmojiPack.value?.id;
        if (!sid || !auth.isAuthenticated || !packId) {
          emojiUploadFeedback.value = {
            tone: 'error',
            message: 'Not signed in or no pack selected.',
          };
          return;
        }
        let imageUrl: string;
        let usedInlineDataUrl = false;
        try {
          imageUrl = await uploadServerEmojiObject(
            token ?? '',
            sid,
            processedFile,
          );
        } catch (e) {
          if (!isEchoObjectStorageNotConfiguredError(e)) {
            emojiUploadFeedback.value = {
              tone: 'error',
              message: e instanceof Error ? e.message : 'Upload failed',
            };
            return;
          }
          imageUrl = await fileToDataUrl(processedFile);
          if (imageUrl.length > MAX_EMOJI_IMAGE_URL_CHARS) {
            emojiUploadFeedback.value = {
              tone: 'error',
              message:
                'Image is too large to store without object storage. Set ECHO_S3_* on the API or use a smaller file.',
            };
            return;
          }
          usedInlineDataUrl = true;
        }
        const { id: newId } = await postEchoServerCustomEmoji(
          token ?? '',
          sid,
          packId,
          {
            name,
            animated,
            imageUrl,
          },
        );
        invalidateServerStickerLibraryCache(sid);
        await refreshExpressionLibrary();
        selectedEmojiId.value = newId;
        selectedStickerId.value = '';
        emojiUploadFeedback.value = {
          tone: 'success',
          message: usedInlineDataUrl
            ? 'Emoji uploaded (stored inline). Add ECHO_S3_* when you want images in object storage.'
            : 'Emoji uploaded successfully.',
        };
        return;
      }

      const mockPreview = await fileToDataUrl(processedFile);
      const newEmoji: ManagedEmoji = {
        id: `em-${Date.now()}`,
        name,
        kind: animated ? 'animated' : 'static',
        previewUrl: mockPreview,
        used: 0,
      };

      selectedEmojiPack.value.emojis = [
        newEmoji,
        ...selectedEmojiPack.value.emojis,
      ];
      selectedEmojiId.value = newEmoji.id;
      selectedStickerId.value = '';
      emojiUploadFeedback.value = {
        tone: 'success',
        message: 'Emoji uploaded successfully.',
      };
    } catch {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Upload failed. Please try another image.',
      };
    }
  }

  async function onStickerUploadFile(file: File) {
    emojiUploadFeedback.value = null;
    if (!file) return;
    if (!isStickerFile(file)) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Use PNG, APNG, or GIF for stickers.',
      };
      return;
    }
    if (!serverId.value) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Select a server before uploading stickers.',
      };
      return;
    }
    if (file.size > MAX_STICKER_INPUT_BYTES) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'File too large. Max input size is 8MB.',
      };
      return;
    }
    if (
      !selectedEmojiPack.value ||
      selectedEmojiPack.value.source !== 'custom'
    ) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Upload is only available for custom packs.',
      };
      return;
    }
    if (packExpressionCount(selectedEmojiPack.value) >= MAX_EMOJIS_PER_PACK) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: `Pack is full (${MAX_EMOJIS_PER_PACK} expressions max).`,
      };
      return;
    }

    const { format, animated } = stickerFormatFromFile(file);
    if (file.size > MAX_STICKER_UPLOAD_BYTES) {
      emojiUploadFeedback.value = {
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
      emojiUploadFeedback.value = {
        tone: 'info',
        message: 'Sticker upload is not available in mock mode.',
      };
      return;
    }

    const sid = serverId.value;
    const token = auth.accessToken;
    const packId = selectedEmojiPack.value.id;
    if (!sid || !auth.isAuthenticated || !token) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: 'Not signed in or no pack selected.',
      };
      return;
    }

    try {
      let imageUrl: string;
      try {
        imageUrl = await uploadServerEmojiObject(token, sid, file);
      } catch (e) {
        if (!isEchoObjectStorageNotConfiguredError(e)) {
          emojiUploadFeedback.value = {
            tone: 'error',
            message: e instanceof Error ? e.message : 'Upload failed',
          };
          return;
        }
        imageUrl = await fileToDataUrl(file);
        if (imageUrl.length > MAX_STICKER_IMAGE_URL_CHARS) {
          emojiUploadFeedback.value = {
            tone: 'error',
            message:
              'Image is too large to store without object storage. Configure ECHO_S3_* or use a smaller file.',
          };
          return;
        }
      }

      const { id: newId } = await postEchoServerCustomEmoji(
        token,
        sid,
        packId,
        {
          name,
          animated,
          imageUrl,
          expressionKind: 'sticker',
          stickerFormat: format,
        },
      );
      invalidateServerStickerLibraryCache(sid);
      await refreshExpressionLibrary();
      selectedStickerId.value = newId;
      selectedEmojiId.value = '';
      emojiUploadFeedback.value = {
        tone: 'success',
        message: `Sticker :${name}: uploaded.`,
      };
    } catch (e) {
      emojiUploadFeedback.value = {
        tone: 'error',
        message: e instanceof Error ? e.message : 'Upload failed',
      };
    }
  }

  async function onEmojiUploadFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await onEmojiUploadFile(file);
    input.value = '';
  }

  async function onStickerUploadFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await onStickerUploadFile(file);
    input.value = '';
  }

  async function removeEmoji(emojiId: string) {
    if (!selectedEmojiPack.value || selectedEmojiPack.value.source !== 'custom')
      return;
    if (!echoSyncCapabilities.isMockDataMode) {
      const sid = serverId.value;
      const token = auth.accessToken;
      const packId = selectedEmojiPack.value.id;
      if (!sid || !auth.isAuthenticated) return;
      try {
        await deleteEchoServerCustomEmoji(token ?? '', sid, packId, emojiId);
        invalidateServerStickerLibraryCache(sid);
        await refreshExpressionLibrary();
      } catch (e) {
        emojiUploadFeedback.value = {
          tone: 'error',
          message: e instanceof Error ? e.message : 'Could not remove emoji',
        };
      }
      return;
    }
    selectedEmojiPack.value.emojis = selectedEmojiPack.value.emojis.filter(
      (emoji) => emoji.id !== emojiId,
    );
    if (selectedEmojiId.value === emojiId) {
      selectedEmojiId.value = selectedEmojiPack.value.emojis[0]?.id ?? '';
      selectedStickerId.value = selectedEmojiId.value
        ? ''
        : (selectedEmojiPack.value.stickers[0]?.id ?? '');
    }
  }

  async function removeSticker(stickerId: string) {
    if (!selectedEmojiPack.value || selectedEmojiPack.value.source !== 'custom')
      return;
    if (!echoSyncCapabilities.isMockDataMode) {
      const sid = serverId.value;
      const token = auth.accessToken;
      const packId = selectedEmojiPack.value.id;
      if (!sid || !auth.isAuthenticated) return;
      try {
        await deleteEchoServerCustomEmoji(token ?? '', sid, packId, stickerId);
        invalidateServerStickerLibraryCache(sid);
        await refreshExpressionLibrary();
      } catch (e) {
        emojiUploadFeedback.value = {
          tone: 'error',
          message: e instanceof Error ? e.message : 'Could not remove sticker',
        };
      }
      return;
    }
    selectedEmojiPack.value.stickers = selectedEmojiPack.value.stickers.filter(
      (sticker) => sticker.id !== stickerId,
    );
    if (selectedStickerId.value === stickerId) {
      selectedStickerId.value = selectedEmojiPack.value.stickers[0]?.id ?? '';
      selectedEmojiId.value = selectedStickerId.value
        ? ''
        : (selectedEmojiPack.value.emojis[0]?.id ?? '');
    }
  }

  async function updateSelectedEmojiName(name: string) {
    if (
      !selectedEmoji.value ||
      !selectedEmojiPack.value ||
      selectedEmojiPack.value.source !== 'custom'
    )
      return;
    const next = name.trim().replace(/\s+/g, '_');
    if (!next) return;
    if (!echoSyncCapabilities.isMockDataMode) {
      const sid = serverId.value;
      const token = auth.accessToken;
      if (!sid || !auth.isAuthenticated) return;
      try {
        await patchEchoServerCustomEmojiName(
          token ?? '',
          sid,
          selectedEmojiPack.value.id,
          selectedEmoji.value.id,
          next,
        );
        await refreshServerEmojiLibrary();
      } catch (e) {
        emojiUploadFeedback.value = {
          tone: 'error',
          message: e instanceof Error ? e.message : 'Could not rename emoji',
        };
      }
      return;
    }
    selectedEmoji.value.name = next;
  }

  function forkSelectedEmojiPack() {
    if (!echoSyncCapabilities.isMockDataMode) return;
    const current = selectedEmojiPack.value;
    if (!current || current.source !== 'market') return;

    const forkedPack: ManagedEmojiPack = {
      ...JSON.parse(JSON.stringify(current)),
      id: `pack-custom-fork-${Date.now()}`,
      source: 'custom',
      description: `Forked from ${current.name}.`,
    };

    serverEmojiPacks.value = serverEmojiPacks.value.map((pack) =>
      pack.id === current.id ? forkedPack : pack,
    );
    selectedEmojiPackId.value = forkedPack.id;
  }

  function openEmojiPackModal(tab: 'create' | 'market') {
    emojiPackModalTab.value = tab;
    emojiUploadFeedback.value = null;
    emojiPackModalOpen.value = true;
  }

  function closeEmojiPackModal() {
    emojiPackModalOpen.value = false;
  }

  return {
    MAX_EMOJI_PACKS,
    MAX_EMOJIS_PER_PACK,
    ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN,
    emojiSearchQuery,
    selectedEmojiPackId,
    selectedEmojiId,
    selectedStickerId,
    customEmojiPackName,
    customEmojiPackDescription,
    customEmojiPackTags,
    customEmojiPackListedInMarket,
    packEditDescription,
    packEditTags,
    packEditListedInMarket,
    saveCustomPackMarketDetails,
    emojiPackMarketSearch,
    emojiPackModalOpen,
    emojiPackModalTab,
    emojiUploadFeedback,
    marketEmojiPacks,
    marketEmojiPacksLoading,
    marketEmojiPacksError,
    refreshMarketEmojiPacks,
    refreshServerEmojiLibrary,
    refreshExpressionLibrary,
    serverEmojiLibraryLoading,
    serverEmojiLibraryError,
    serverEmojiPacks: serverEmojiPacksWithStickers,
    totalServerEmojis,
    canImportMorePacks,
    selectedEmojiPack,
    selectedEmoji,
    selectedSticker,
    filteredPackEmojis,
    filteredPackStickers,
    filteredMarketEmojiPacks,
    createCustomEmojiPack,
    importMarketEmojiPack,
    onEmojiUploadFile,
    onEmojiUploadFileChange,
    onStickerUploadFile,
    onStickerUploadFileChange,
    removeEmoji,
    removeSticker,
    updateSelectedEmojiName,
    forkSelectedEmojiPack,
    openEmojiPackModal,
    closeEmojiPackModal,
  };
}
