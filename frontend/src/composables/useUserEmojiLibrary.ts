import { computed, ref } from 'vue';
import type { EmojiCategory, EmojiEntry } from '@/composables/useEmojiData';
import { customEmojiPickerHtml } from '@/composables/useServerEmojiLibrary';
import { parseTwemoji } from '@/utils/twemoji';
import { safeCustomEmojiUrl } from '@/utils/customEmojiUrl';

const STORAGE_KEY_V1 = 'echo-user-emoji-library-v1';
const STORAGE_KEY_V2 = 'echo-user-emoji-library-v2';

const MAX_SAVED_PACKS = 6;
const MAX_PACK_EMOJIS = 64;

type StoredUserEmoji = {
  id: string;
  name: string;
  serverId: string;
  animated: boolean;
  imageUrl: string;
  token: string;
};

type StoredUserEmojiPackV2 = {
  id: string;
  name: string;
  emojis: StoredUserEmoji[];
  createdAt: number;
  source?: {
    categorySlug?: string;
    serverId?: string;
  };
};

function isStoredUserEmoji(row: unknown): row is StoredUserEmoji {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.serverId === 'string' &&
    typeof r.animated === 'boolean' &&
    typeof r.imageUrl === 'string' &&
    typeof r.token === 'string'
  );
}

function isStoredUserEmojiPackV2(row: unknown): row is StoredUserEmojiPackV2 {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return false;
  if (!Array.isArray(r.emojis)) return false;
  if (typeof r.createdAt !== 'number') return false;
  return r.emojis.every(isStoredUserEmoji);
}

function loadV1StoredUserEmojis(): StoredUserEmoji[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredUserEmoji);
  } catch {
    return [];
  }
}

function loadStoredUserEmojiPacks(): StoredUserEmojiPackV2[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter(isStoredUserEmojiPackV2)
          .slice(0, MAX_SAVED_PACKS)
          .map((p) => ({ ...p, emojis: p.emojis.slice(0, MAX_PACK_EMOJIS) }));
      }
    }
  } catch {
    /* ignore */
  }

  // Migration path: v1 stored emojis -> one legacy pack in v2 (truncated).
  const legacy = loadV1StoredUserEmojis();
  if (!legacy.length) return [];
  return [
    {
      id: 'legacy',
      name: 'Saved Emojis (Legacy)',
      emojis: legacy.slice(0, MAX_PACK_EMOJIS),
      createdAt: Date.now(),
      source: { categorySlug: 'legacy' },
    },
  ];
}

const storedUserEmojiPacks = ref<StoredUserEmojiPackV2[]>(
  loadStoredUserEmojiPacks(),
);

function persistStoredUserEmojiPacks(next: StoredUserEmojiPackV2[]) {
  storedUserEmojiPacks.value = next.slice(0, MAX_SAVED_PACKS);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY_V2,
      JSON.stringify(storedUserEmojiPacks.value),
    );
  } catch {
    /* ignore local persistence failures */
  }
}

function toPickerEntry(row: StoredUserEmoji): EmojiEntry {
  const imageUrl = safeCustomEmojiUrl(row.imageUrl) ?? '';
  return {
    kind: 'custom',
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    slug: row.name.toLowerCase(),
    animated: row.animated,
    imageUrl,
    emoji: row.token,
    html: customEmojiPickerHtml(imageUrl, row.name),
    skin_tone_support: false,
  };
}

function categoryToStoredEmojis(category: EmojiCategory): StoredUserEmoji[] {
  const out: StoredUserEmoji[] = [];
  for (const entry of category.emojis) {
    if (
      entry.kind !== 'custom' ||
      !entry.id ||
      !entry.serverId ||
      !entry.imageUrl ||
      typeof entry.animated !== 'boolean' ||
      !entry.emoji
    ) {
      return [];
    }
    out.push({
      id: entry.id,
      name: entry.name,
      serverId: entry.serverId,
      animated: entry.animated,
      imageUrl: entry.imageUrl,
      token: entry.emoji,
    });
    if (out.length >= MAX_PACK_EMOJIS) break;
  }
  return out;
}

export function useUserEmojiLibrary() {
  const packs = computed(() =>
    storedUserEmojiPacks.value.map((p) => ({ id: p.id, name: p.name })),
  );

  const savedEntries = computed(() =>
    storedUserEmojiPacks.value.flatMap((p) => p.emojis.map(toPickerEntry)),
  );

  const emojiById = computed(() => {
    const m = new Map<string, StoredUserEmoji>();
    for (const p of storedUserEmojiPacks.value) {
      for (const e of p.emojis) {
        if (!m.has(e.id)) m.set(e.id, e);
      }
    }
    return m;
  });

  const packsForSnapshot = computed(
    () =>
      storedUserEmojiPacks.value.map((p) => ({
        emojis: p.emojis.map((e) => ({ id: e.id, imageUrl: e.imageUrl })),
      })) as readonly { emojis: readonly { id: string; imageUrl: string }[] }[],
  );

  const pickerPackCategories = computed<EmojiCategory[]>(() => {
    if (!storedUserEmojiPacks.value.length) return [];
    return storedUserEmojiPacks.value.map((p) => {
      const first = p.emojis[0];
      return {
        name: p.name,
        slug: `user-emoji-pack-${p.id}`,
        emojis: p.emojis.map((row) => toPickerEntry(row)),
        navIconImageUrl: first
          ? (safeCustomEmojiUrl(first.imageUrl) ?? undefined)
          : undefined,
        navIconImageAlt: first ? `:${first.name}:` : undefined,
        navIconHtml: first ? parseTwemoji('🎒') : parseTwemoji('🎒'),
      };
    });
  });

  function saveEmojiPackFromCategory(
    category: EmojiCategory,
    opts?: { replacePackId?: string },
  ): 'saved' | 'replaced' | 'full' | 'invalid' {
    const emojis = categoryToStoredEmojis(category);
    if (!emojis.length) return 'invalid';

    const replaceId = opts?.replacePackId?.trim() || '';
    if (replaceId) {
      const idx = storedUserEmojiPacks.value.findIndex(
        (p) => p.id === replaceId,
      );
      if (idx < 0) return 'invalid';
      const updated = storedUserEmojiPacks.value.slice();
      updated[idx] = {
        id: updated[idx]!.id,
        name: category.name || 'Emoji Pack',
        emojis,
        createdAt: Date.now(),
        source: { categorySlug: category.slug, serverId: emojis[0]?.serverId },
      };
      persistStoredUserEmojiPacks(updated);
      return 'replaced';
    }

    if (storedUserEmojiPacks.value.length >= MAX_SAVED_PACKS) return 'full';

    const nextPack: StoredUserEmojiPackV2 = {
      id: `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: category.name || 'Emoji Pack',
      emojis,
      createdAt: Date.now(),
      source: { categorySlug: category.slug, serverId: emojis[0]?.serverId },
    };
    persistStoredUserEmojiPacks([nextPack, ...storedUserEmojiPacks.value]);
    return 'saved';
  }

  return {
    packs,
    maxPacks: MAX_SAVED_PACKS,
    savedEntries,
    emojiById,
    packsForSnapshot,
    pickerPackCategories,
    saveEmojiPackFromCategory,
  };
}
