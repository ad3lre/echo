import { ref, computed, onScopeDispose, watch, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  fetchServerEmojiLibraryPacks,
  recordServerEmojiUsage,
  type EchoEmojiLibraryEmojiApi,
  type EchoEmojiLibraryPackApi,
} from '@/features/chat/emoji/serverEmojiLibrary';
import { scheduleDeferredTask } from '@/features/layout/failures/scheduleDeferredTask';

/** One fetch per server for all `useServerEmojiLibrary()` consumers (composer, popouts, reactions). */
const emojiPackCache = new Map<string, EchoEmojiLibraryPackApi[]>();
const emojiPackInflight = new Map<string, Promise<EchoEmojiLibraryPackApi[]>>();

function emojiPackCacheKey(serverId: string | undefined): string | null {
  const sid = serverId?.trim() ?? '';
  if (!sid || sid === 'echo') return null;
  return sid;
}

async function loadServerEmojiPacksOnce(
  serverId: string,
  token: string | null | undefined,
): Promise<EchoEmojiLibraryPackApi[]> {
  const key = emojiPackCacheKey(serverId);
  if (!key) return [];
  const cached = emojiPackCache.get(key);
  if (cached) return cached;
  let p = emojiPackInflight.get(key);
  if (!p) {
    p = fetchServerEmojiLibraryPacks(token ?? '', key)
      .then((packs) => {
        emojiPackCache.set(key, packs);
        return packs;
      })
      .finally(() => {
        emojiPackInflight.delete(key);
      });
    emojiPackInflight.set(key, p);
  }
  return p;
}

/** Call after mutating server emoji packs (e.g. settings) so the next load refetches. */
export function invalidateServerEmojiLibraryCache(serverId?: string) {
  const key = emojiPackCacheKey(serverId);
  if (key) {
    emojiPackCache.delete(key);
    emojiPackInflight.delete(key);
    return;
  }
  emojiPackCache.clear();
  emojiPackInflight.clear();
}
import type {
  EmojiCategory,
  EmojiEntry,
} from '@/features/chat/emoji/useEmojiData';
import { parseTwemoji } from '@/features/chat/emoji/twemoji';
import {
  renderCustomEmojiHtml,
  safeCustomEmojiUrl,
} from '@/features/chat/emoji/customEmojiUrl';
import { ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX } from '@shared/echoEmojiCdn';
import { API_BASE } from '@/config';
import {
  linkTokenCustomEmoji,
  linkTokenCustomEmojiAnimated,
} from '@/features/layout/ids/idTokens';

export function customEmojiPickerHtml(
  imageUrl: string,
  name: string,
  emojiId?: string,
  animated?: boolean,
): string {
  return (
    renderCustomEmojiHtml(imageUrl, name, {
      id: emojiId,
      animated,
    }) ?? parseTwemoji('❓')
  );
}

/** Prefer API-resolved URLs; fall back to the public emoji CDN route by id. */
function customEmojiLibraryDisplayUrl(
  emojiId: string,
  storedUrl: string,
): string {
  const safe = safeCustomEmojiUrl(storedUrl);
  if (safe) return safe;
  const id = emojiId.trim();
  if (!/^\d+$/.test(id)) return '';
  try {
    const rel = `${ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX}${encodeURIComponent(id)}`;
    return (
      safeCustomEmojiUrl(
        new URL(rel, `${API_BASE.replace(/\/$/, '')}/`).href,
      ) ?? ''
    );
  } catch {
    return '';
  }
}

export function libraryEmojiToEntry(
  serverId: string,
  e: EchoEmojiLibraryEmojiApi,
): EmojiEntry {
  const imageUrl = customEmojiLibraryDisplayUrl(e.id, e.imageUrl);
  const token = e.animated
    ? linkTokenCustomEmojiAnimated(e.name, e.id)
    : linkTokenCustomEmoji(e.name, e.id);
  return {
    kind: 'custom',
    id: e.id,
    serverId: e.serverId ?? serverId,
    name: e.name,
    slug: `ce-${e.id}`,
    animated: e.animated,
    imageUrl,
    emoji: token,
    html: customEmojiPickerHtml(imageUrl, e.name, e.id, e.animated),
    skin_tone_support: false,
  };
}

export function useServerEmojiLibrary(
  serverId: Ref<string | null | undefined>,
) {
  const auth = useAuthSessionStore();
  const packs = ref<EchoEmojiLibraryPackApi[]>([]);
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
    const token = auth.accessToken;
    if (!auth.isAuthenticated) {
      packs.value = [];
      return;
    }
    const sid = serverId.value?.trim() ?? '';
    const cacheKey = emojiPackCacheKey(sid);
    if (!cacheKey) {
      packs.value = [];
      error.value = null;
      loading.value = false;
      return;
    }
    if (emojiPackCache.has(cacheKey)) {
      packs.value = emojiPackCache.get(cacheKey)!;
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      packs.value = await loadServerEmojiPacksOnce(sid, token ?? '');
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to load emoji library';
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
    ([_sid, isAuthenticated]) => {
      deferredRefresh?.cancel();
      deferredRefresh = null;
      if (!isAuthenticated || echoSyncCapabilities.isMockDataMode) {
        void refresh();
        return;
      }
      const sid = serverId.value?.trim() ?? '';
      if (
        emojiPackCacheKey(sid) &&
        emojiPackCache.has(emojiPackCacheKey(sid)!)
      ) {
        void refresh();
        return;
      }
      deferredRefresh = scheduleDeferredTask(
        () => {
          deferredRefresh = null;
          void refresh();
        },
        {
          timeoutMs: 2000,
          fallbackDelayMs: 450,
        },
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    deferredRefresh?.cancel();
  });

  const emojiById = computed(() => {
    const map = new Map<
      string,
      EchoEmojiLibraryEmojiApi & { serverId: string }
    >();
    for (const p of packs.value) {
      for (const e of p.emojis) {
        const row = {
          ...e,
          serverId:
            (e.serverId ?? serverId.value ?? 'global').trim() || 'global',
        };
        map.set(e.id, row);
        const d = e.sourceDiscordEmojiId?.trim();
        if (d) map.set(d, row);
      }
    }
    return map;
  });

  const flatCustomEmojis = computed(() => {
    const out: EmojiEntry[] = [];
    for (const p of packs.value) {
      for (const e of p.emojis) {
        const entry = libraryEmojiToEntry(serverId.value ?? 'global', e);
        // Add name as a secondary slug for autocomplete matching
        entry.slug = e.name.toLowerCase();
        out.push(entry);
      }
    }
    return out;
  });

  function pickerPackCategories(): EmojiCategory[] {
    const sid = serverId.value ?? 'global';
    if (!packs.value.length) return [];
    return packs.value.map((p) => ({
      name: p.name,
      slug: `server-emoji-${p.id}`,
      navIconImageUrl: p.emojis[0]
        ? (safeCustomEmojiUrl(p.emojis[0].imageUrl) ?? undefined)
        : undefined,
      navIconImageAlt: p.emojis[0] ? `:${p.emojis[0].name}:` : undefined,
      navIconHtml: p.emojis[0] ? parseTwemoji('⭐') : parseTwemoji('⭐'),
      emojis: p.emojis.map((e) => libraryEmojiToEntry(sid, e)),
    }));
  }

  async function recordUsage(emojiId: string) {
    const sid = serverId.value;
    const token = auth.accessToken;
    if (!sid || !auth.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    try {
      await recordServerEmojiUsage(token ?? '', sid, emojiId);
    } catch {
      /* non-blocking */
    }
  }

  return {
    packs,
    loading,
    error,
    refresh,
    emojiById,
    flatCustomEmojis,
    pickerPackCategories,
    recordUsage,
  };
}
