import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useServerStore } from '@/features/layout/server';
import { useServerEmojiLibrary } from '@/features/chat/emoji/useServerEmojiLibrary';
import {
  resolveCustomEmojiImageUrlForDisplay,
  safeCustomEmojiUrl,
  shouldAllowDiscordCdnGuessForEmojiId,
} from '@/features/chat/emoji/customEmojiUrl';
import { collectCustomEmojiIdsFromTexts } from '@/features/chat/emoji/collectCustomEmojiIdsFromText';
import {
  isEchoEmojiTokenResolveMiss,
  useGlobalEmojiTokenResolver,
} from '@/features/chat/emoji/useGlobalEmojiTokenResolver';
import type { IdTokenResolvers } from '@/features/chat/markdown/useMarkdown';
import type { ChannelSummary, MessageWithAuthor } from '@shared/types';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import {
  ensureIconCatalogLoaded,
  getIconUrlByFilename,
} from '@/assets/iconCatalog';

function snapshotEmojiLibraryFromPacks(
  packs: readonly { emojis: readonly { id: string; imageUrl: string }[] }[],
): string {
  let s = '';
  for (const p of packs) {
    for (const e of p.emojis) {
      s += `${e.id}\x1e${e.imageUrl}\x1e`;
    }
  }
  return s;
}

export type UseChatCustomEmojiResolversOptions = {
  serverId: Ref<string | undefined>;
  users?: Ref<UserForAuthor[] | undefined>;
  channels?: Ref<ChannelSummary[] | undefined>;
  activeChannelMessages?: Ref<
    ReadonlyMap<string, MessageWithAuthor> | undefined
  >;
};

/**
 * Shared custom-emoji id→url map, global resolve queue, and id-token resolvers for chat UI.
 */
export function useChatCustomEmojiResolvers(
  options: UseChatCustomEmojiResolversOptions,
) {
  const serverStore = useServerStore();
  const globalEmojiResolver = useGlobalEmojiTokenResolver();
  const serverEmojiLibrary = useServerEmojiLibrary(options.serverId);

  const customEmojiUrlById = computed(() => {
    void globalEmojiResolver.cacheVersion.value;
    const m = new Map<string, string>();
    for (const [id, row] of serverEmojiLibrary.emojiById.value) {
      const safe = safeCustomEmojiUrl(row.imageUrl);
      if (safe) m.set(id, safe);
    }
    for (const [id, url] of globalEmojiResolver.urlById.value) {
      if (m.has(id)) continue;
      const safe = safeCustomEmojiUrl(url);
      if (safe) m.set(id, safe);
    }
    return m;
  });

  const customEmojiByName = computed(() => {
    void globalEmojiResolver.cacheVersion.value;
    const m = new Map<
      string,
      { id: string; name: string; animated: boolean }
    >();
    for (const row of serverEmojiLibrary.emojiById.value.values()) {
      const n = row.name.trim().toLowerCase();
      if (!n || m.has(n)) continue;
      m.set(n, { id: row.id, name: row.name, animated: row.animated });
    }
    for (const [n, meta] of globalEmojiResolver.emojiByName.value) {
      if (m.has(n)) continue;
      m.set(n, { id: meta.id, name: meta.name, animated: meta.animated });
    }
    return m;
  });

  let _resolverCacheVer = 0;
  let _prevUserNameKey: string | null = null;
  let _prevChannelNameKey: string | null = null;
  let _prevServerNameKey: string | null = null;
  let _prevEmojiSnapshotKey = '';
  let _prevIconCatalogKey = '';

  const iconCatalogReady = ref(false);
  void ensureIconCatalogLoaded().then(() => {
    iconCatalogReady.value = true;
  });

  const resolverCacheVersion = computed(() => {
    const uKey = (options.users?.value ?? [])
      .map((u) => `${u.id}\x00${u.name}`)
      .join('\x1e');
    const cKey = (options.channels?.value ?? [])
      .map((ch) => `${ch.id}\x00${ch.name}`)
      .join('\x1e');
    const sKey = serverStore.servers
      .map((s) => `${s.id}\x00${s.name}`)
      .join('\x1e');
    const emojiSnapshotKey = `${snapshotEmojiLibraryFromPacks(
      serverEmojiLibrary.packs.value,
    )}\x1f${globalEmojiResolver.cacheVersion.value}\x1f${customEmojiByName.value.size}`;
    const iconCatalogKey = iconCatalogReady.value ? '1' : '0';
    if (
      uKey !== _prevUserNameKey ||
      cKey !== _prevChannelNameKey ||
      sKey !== _prevServerNameKey ||
      emojiSnapshotKey !== _prevEmojiSnapshotKey ||
      iconCatalogKey !== _prevIconCatalogKey
    ) {
      _resolverCacheVer++;
      _prevUserNameKey = uKey;
      _prevChannelNameKey = cKey;
      _prevServerNameKey = sKey;
      _prevEmojiSnapshotKey = emojiSnapshotKey;
      _prevIconCatalogKey = iconCatalogKey;
    }
    return _resolverCacheVer;
  });

  function resolveCustomEmojiUrl(
    id: string,
    name: string,
    animated: boolean,
  ): string | undefined {
    const cache = customEmojiUrlById.value;
    const echoMissed = isEchoEmojiTokenResolveMiss(id);
    const allowDiscordGuess = shouldAllowDiscordCdnGuessForEmojiId(
      id,
      cache,
      echoMissed,
    );
    let url = resolveCustomEmojiImageUrlForDisplay(
      id,
      animated,
      cache,
      echoMissed,
      { allowDiscordCdnGuess: allowDiscordGuess },
    );
    if (!url && name.trim()) {
      const byName = customEmojiByName.value.get(name.trim().toLowerCase());
      if (byName) {
        const byNameMissed = isEchoEmojiTokenResolveMiss(byName.id);
        url = resolveCustomEmojiImageUrlForDisplay(
          byName.id,
          byName.animated,
          cache,
          byNameMissed,
          {
            allowDiscordCdnGuess: shouldAllowDiscordCdnGuessForEmojiId(
              byName.id,
              cache,
              byNameMissed,
            ),
          },
        );
        if (!url) globalEmojiResolver.ensureEmojiId(byName.id);
      }
    }
    if (!url) globalEmojiResolver.ensureEmojiId(id);
    return url ?? undefined;
  }

  const idTokenResolvers = computed<IdTokenResolvers>(() => ({
    userLabel: (id) =>
      options.users?.value?.find((u) => u.id === id)?.name ?? id,
    channelLabel: (id) =>
      options.channels?.value?.find((c) => c.id === id)?.name ?? id,
    serverLabel: (id) =>
      serverStore.servers.find((s) => s.id === id)?.name ?? id,
    roleLabel: (id) => id,
    messageLabel: (id) => (id.length > 12 ? `${id.slice(0, 8)}…` : id),
    customEmojiImageUrl: (id, name, animated) =>
      resolveCustomEmojiUrl(id, name, animated),
    customEmojiByName: customEmojiByName.value,
    appIconImageUrl: (filename) => getIconUrlByFilename(filename),
    _cacheVersion: resolverCacheVersion.value,
  }));

  const channelCustomEmojiIds = computed(() => {
    const msgs = options.activeChannelMessages?.value;
    if (!msgs?.size) return [] as string[];
    const texts: string[] = [];
    for (const m of msgs.values()) {
      const c = m.content?.trim();
      if (c) texts.push(c);
      for (const r of m.reactions ?? []) {
        const e = r.emoji?.trim();
        if (e) texts.push(e);
      }
    }
    return collectCustomEmojiIdsFromTexts(texts);
  });

  watch(
    channelCustomEmojiIds,
    (ids) => {
      if (ids.length > 0) globalEmojiResolver.ensureEmojiIds(ids);
    },
    { immediate: true },
  );

  function prefetchEmojiIdsFromTexts(texts: Iterable<string>) {
    const ids = collectCustomEmojiIdsFromTexts(texts);
    if (ids.length > 0) globalEmojiResolver.ensureEmojiIds(ids);
  }

  return {
    globalEmojiResolver,
    customEmojiUrlById,
    customEmojiByName,
    idTokenResolvers,
    prefetchEmojiIdsFromTexts,
    ensureEmojiId: globalEmojiResolver.ensureEmojiId,
    ensureEmojiIds: globalEmojiResolver.ensureEmojiIds,
  };
}
