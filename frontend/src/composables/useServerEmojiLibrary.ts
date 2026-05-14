import { ref, computed, onScopeDispose, watch, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  fetchUserEmojiLibraryPacks,
  recordServerEmojiUsage,
  type EchoEmojiLibraryEmojiApi,
  type EchoEmojiLibraryPackApi,
} from '@/services/orchestration/serverEmojiLibrary';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';

/** One fetch per server for all `useServerEmojiLibrary()` consumers (composer, popouts, reactions). */
const emojiPackCache = new Map<string, EchoEmojiLibraryPackApi[]>();
const emojiPackInflight = new Map<string, Promise<EchoEmojiLibraryPackApi[]>>();
const GLOBAL_EMOJI_CACHE_KEY = '__global_user_emoji_library__';

async function loadServerEmojiPacksOnce(
  _serverId: string,
  token: string | null | undefined,
): Promise<EchoEmojiLibraryPackApi[]> {
  const cached = emojiPackCache.get(GLOBAL_EMOJI_CACHE_KEY);
  if (cached) return cached;
  let p = emojiPackInflight.get(GLOBAL_EMOJI_CACHE_KEY);
  if (!p) {
    p = fetchUserEmojiLibraryPacks(token ?? '')
      .then((packs) => {
        emojiPackCache.set(GLOBAL_EMOJI_CACHE_KEY, packs);
        return packs;
      })
      .finally(() => {
        emojiPackInflight.delete(GLOBAL_EMOJI_CACHE_KEY);
      });
    emojiPackInflight.set(GLOBAL_EMOJI_CACHE_KEY, p);
  }
  return p;
}

/** Call after mutating server emoji packs (e.g. settings) so the next load refetches. */
export function invalidateServerEmojiLibraryCache(serverId?: string) {
  if (serverId) return;
  emojiPackCache.clear();
}
import type { EmojiCategory, EmojiEntry } from '@/composables/useEmojiData';
import { parseTwemoji } from '@/utils/twemoji';
import {
  renderCustomEmojiHtml,
  safeCustomEmojiUrl,
} from '@/utils/customEmojiUrl';
import {
  linkTokenCustomEmoji,
  linkTokenCustomEmojiAnimated,
} from '@/utils/idTokens';

export function customEmojiPickerHtml(imageUrl: string, name: string): string {
  return renderCustomEmojiHtml(imageUrl, name) ?? parseTwemoji('❓');
}

export function libraryEmojiToEntry(
  serverId: string,
  e: EchoEmojiLibraryEmojiApi,
): EmojiEntry {
  const imageUrl = safeCustomEmojiUrl(e.imageUrl) ?? '';
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
    html: customEmojiPickerHtml(imageUrl, e.name),
    skin_tone_support: false,
  };
}

export function useServerEmojiLibrary(serverId: Ref<string | undefined>) {
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
    if (emojiPackCache.has(GLOBAL_EMOJI_CACHE_KEY)) {
      packs.value = emojiPackCache.get(GLOBAL_EMOJI_CACHE_KEY)!;
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      packs.value = await loadServerEmojiPacksOnce(
        serverId.value ?? '',
        token ?? '',
      );
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
      if (emojiPackCache.has(GLOBAL_EMOJI_CACHE_KEY)) {
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
