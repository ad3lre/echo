import { computed, ref, shallowReactive } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/stores/authSession';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';
import { resolveEmojiTokens } from '@/services/orchestration/emojiTokenResolve';
import { safeCustomEmojiUrl } from '@/utils/customEmojiUrl';

export type ResolvedCustomEmojiMeta = {
  id: string;
  name: string;
  animated: boolean;
  imageUrl: string;
  sourceDiscordEmojiId?: string;
};

const urlByIdState = shallowReactive(new Map<string, string>());
const metaByIdState = shallowReactive(
  new Map<string, ResolvedCustomEmojiMeta>(),
);
const pendingIds = new Set<string>();
const missingIds = new Set<string>();
let inflight: Promise<void> | null = null;
let deferredFlush: ReturnType<typeof scheduleDeferredTask> | null = null;
const cacheVersion = ref(0);

const MAX_BATCH = 120;
const MAX_MISSING_TRACK = 2000;

function normalizeEmojiId(id: string): string | null {
  const t = id.trim();
  if (!t) return null;
  if (t.length > 64) return null;
  if (!/^\d+$/.test(t)) return null;
  return t;
}

function markMissing(id: string) {
  missingIds.add(id);
  while (missingIds.size > MAX_MISSING_TRACK) {
    const first = missingIds.values().next().value as string | undefined;
    if (!first) break;
    missingIds.delete(first);
  }
}

/** True after `/emoji/resolve` returned no row for this numeric id (cross-guild Discord emoji). */
export function isEchoEmojiTokenResolveMiss(id: string): boolean {
  const k = normalizeEmojiId(id);
  return !!k && missingIds.has(k);
}

async function flushQueued(token: string) {
  if (inflight) return;
  inflight = (async () => {
    while (pendingIds.size > 0) {
      const batch = Array.from(pendingIds).slice(0, MAX_BATCH);
      for (const id of batch) pendingIds.delete(id);

      let resolved: Awaited<ReturnType<typeof resolveEmojiTokens>>;
      try {
        resolved = await resolveEmojiTokens(token, batch);
      } catch {
        for (const id of batch) pendingIds.add(id);
        cacheVersion.value += 1;
        break;
      }
      const hit = new Set<string>();
      for (const row of resolved) {
        const key = normalizeEmojiId(row.key);
        const url =
          (typeof row.assetUrl === 'string' ? row.assetUrl.trim() : '') ||
          (typeof row.imageUrl === 'string' ? row.imageUrl.trim() : '');
        const resolvedUrl = url ? (safeCustomEmojiUrl(url) ?? url) : '';
        const id = normalizeEmojiId(row.id);
        if (!key || !resolvedUrl) continue;
        urlByIdState.set(key, resolvedUrl);
        hit.add(key);
        const name =
          typeof row.name === 'string' ? row.name.trim().toLowerCase() : '';
        const discordSource =
          typeof row.sourceDiscordEmojiId === 'string'
            ? row.sourceDiscordEmojiId.trim()
            : '';
        const meta: ResolvedCustomEmojiMeta = {
          id: id ?? key,
          name: typeof row.name === 'string' ? row.name.trim() : 'emoji',
          animated: row.animated === true,
          imageUrl: resolvedUrl,
          ...(discordSource ? { sourceDiscordEmojiId: discordSource } : {}),
        };
        metaByIdState.set(key, meta);
        if (id && id !== key) {
          urlByIdState.set(id, resolvedUrl);
          metaByIdState.set(id, meta);
        }
      }
      for (const id of batch) {
        if (!hit.has(id)) markMissing(id);
      }
      cacheVersion.value += 1;
    }
  })().finally(() => {
    inflight = null;
  });
  await inflight;
}

function scheduleFlush(token: string) {
  if (deferredFlush) return;
  deferredFlush = scheduleDeferredTask(
    () => {
      deferredFlush = null;
      void flushQueued(token);
    },
    { timeoutMs: 60, fallbackDelayMs: 30 },
  );
}

export function useGlobalEmojiTokenResolver() {
  const auth = useAuthSessionStore();

  function queueEmojiIds(ids: readonly string[]) {
    if (!auth.isAuthenticated || echoSyncCapabilities.isMockDataMode) return;
    const token = auth.accessToken ?? '';
    let queued = false;
    for (const raw of ids) {
      const k = normalizeEmojiId(raw);
      if (!k) continue;
      if (urlByIdState.has(k) || missingIds.has(k)) continue;
      pendingIds.add(k);
      queued = true;
    }
    if (queued) scheduleFlush(token);
  }

  function ensureEmojiId(id: string) {
    queueEmojiIds([id]);
  }

  function ensureEmojiIds(ids: readonly string[]) {
    queueEmojiIds(ids);
  }

  const emojiByName = computed(() => {
    const m = new Map<string, ResolvedCustomEmojiMeta>();
    for (const meta of metaByIdState.values()) {
      const n = meta.name.trim().toLowerCase();
      if (!n || m.has(n)) continue;
      m.set(n, meta);
    }
    return m;
  });

  return {
    urlById: computed(() => urlByIdState),
    emojiByName,
    ensureEmojiId,
    ensureEmojiIds,
    cacheVersion: computed(() => cacheVersion.value),
  };
}
