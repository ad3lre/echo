import { ref, computed, watch, onScopeDispose, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { echoFetch } from '@/api/echo/transport';
import { scheduleDeferredTask } from '@/features/layout/failures/scheduleDeferredTask';
import { safeCustomEmojiUrl } from '@/features/chat/emoji/customEmojiUrl';
import type {
  EmojiCategory,
  EmojiEntry,
} from '@/features/chat/emoji/emojiTypes';
import { parseTwemoji } from '@/features/chat/emoji/twemoji';
import { customEmojiPickerHtml } from '@/features/chat/emoji/useServerEmojiLibrary';
import type {
  MessageStickerFormat,
  MessageStickerPayload,
} from '@shared/types';

export type EchoStickerLibraryStickerApi = {
  id: string;
  serverId: string;
  name: string;
  format: MessageStickerFormat;
  imageUrl: string;
  useCount?: number;
  sourceDiscordStickerId?: string | null;
};

export type EchoStickerLibraryPackApi = {
  id: string;
  name: string;
  position: number;
  stickers: EchoStickerLibraryStickerApi[];
};

const stickerPackCache = new Map<string, EchoStickerLibraryPackApi[]>();
const stickerPackInflight = new Map<
  string,
  Promise<EchoStickerLibraryPackApi[]>
>();

function cacheKey(serverId: string | undefined): string | null {
  const sid = serverId?.trim() ?? '';
  if (!sid || sid === 'echo') return null;
  return sid;
}

async function loadStickerPacksOnce(
  serverId: string,
  token: string | null | undefined,
): Promise<EchoStickerLibraryPackApi[]> {
  const key = cacheKey(serverId);
  if (!key) return [];
  const cached = stickerPackCache.get(key);
  if (cached) return cached;
  let p = stickerPackInflight.get(key);
  if (!p) {
    p = echoFetch<{ packs: EchoStickerLibraryPackApi[] }>(
      token ?? '',
      `/servers/${encodeURIComponent(key)}/sticker-library`,
    )
      .then((res) => {
        const packs = res.packs ?? [];
        stickerPackCache.set(key, packs);
        return packs;
      })
      .finally(() => {
        stickerPackInflight.delete(key);
      });
    stickerPackInflight.set(key, p);
  }
  return p;
}

export function invalidateServerStickerLibraryCache(serverId?: string) {
  const key = cacheKey(serverId);
  if (key) {
    stickerPackCache.delete(key);
    stickerPackInflight.delete(key);
    return;
  }
  stickerPackCache.clear();
  stickerPackInflight.clear();
}

export function libraryStickerToEntry(
  serverId: string,
  sticker: EchoStickerLibraryStickerApi,
): EmojiEntry {
  const imageUrl = safeCustomEmojiUrl(sticker.imageUrl) ?? '';
  return {
    kind: 'sticker',
    id: sticker.id,
    serverId: sticker.serverId ?? serverId,
    name: sticker.name,
    slug: `cs-${sticker.id}`,
    stickerFormat: sticker.format,
    imageUrl,
    emoji: `:${sticker.name}:`,
    html: customEmojiPickerHtml(imageUrl, sticker.name),
    skin_tone_support: false,
  };
}

export function stickerToPayload(
  row: EchoStickerLibraryStickerApi,
): MessageStickerPayload {
  const url = safeCustomEmojiUrl(row.imageUrl) ?? row.imageUrl;
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    url,
  };
}

export function useServerStickerLibrary(
  serverId: Ref<string | null | undefined>,
) {
  const auth = useAuthSessionStore();
  const packs = ref<EchoStickerLibraryPackApi[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let deferredRefresh: ReturnType<typeof scheduleDeferredTask> | null = null;

  async function refresh() {
    if (echoSyncCapabilities.isMockDataMode) {
      packs.value = [];
      error.value = null;
      loading.value = false;
      return;
    }
    const sid = serverId.value?.trim() ?? '';
    const key = cacheKey(sid);
    if (!auth.isAuthenticated || !key) {
      packs.value = [];
      return;
    }
    if (stickerPackCache.has(key)) {
      packs.value = stickerPackCache.get(key)!;
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      packs.value = await loadStickerPacksOnce(sid, auth.accessToken ?? '');
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to load sticker library';
      packs.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(
    () =>
      [
        serverId.value,
        auth.isAuthenticated,
        auth.accessToken,
        echoSyncCapabilities.isMockDataMode,
      ] as const,
    ([, isAuthenticated]) => {
      deferredRefresh?.cancel();
      deferredRefresh = null;
      if (!isAuthenticated || echoSyncCapabilities.isMockDataMode) {
        void refresh();
        return;
      }
      const sid = serverId.value?.trim() ?? '';
      const key = cacheKey(sid);
      if (key && stickerPackCache.has(key)) {
        void refresh();
        return;
      }
      deferredRefresh = scheduleDeferredTask(
        () => {
          deferredRefresh = null;
          void refresh();
        },
        { timeoutMs: 2000, fallbackDelayMs: 450 },
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    deferredRefresh?.cancel();
  });

  const flatStickers = computed(() => {
    const out: EchoStickerLibraryStickerApi[] = [];
    for (const p of packs.value) {
      for (const s of p.stickers) out.push(s);
    }
    return out;
  });

  const stickerById = computed(() => {
    const m = new Map<string, EchoStickerLibraryStickerApi>();
    for (const s of flatStickers.value) m.set(s.id, s);
    return m;
  });

  const flatStickerEntries = computed(() => {
    const sid = serverId.value ?? 'global';
    return flatStickers.value.map((s) => libraryStickerToEntry(sid, s));
  });

  function pickerPackCategories(): EmojiCategory[] {
    const sid = serverId.value ?? 'global';
    if (!packs.value.length) return [];
    return packs.value
      .filter((p) => p.stickers.some((s) => s.format !== 'lottie'))
      .map((p) => {
        const stickers = p.stickers.filter((s) => s.format !== 'lottie');
        const first = stickers[0];
        return {
          name: p.name,
          slug: `server-sticker-${p.id}`,
          navIconImageUrl: first
            ? (safeCustomEmojiUrl(first.imageUrl) ?? undefined)
            : undefined,
          navIconImageAlt: first ? `:${first.name}:` : undefined,
          navIconHtml: parseTwemoji('🏷️'),
          emojis: stickers.map((s) => libraryStickerToEntry(sid, s)),
        };
      });
  }

  return {
    packs,
    loading,
    error,
    refresh,
    flatStickers,
    flatStickerEntries,
    stickerById,
    pickerPackCategories,
    stickerToPayload,
  };
}
