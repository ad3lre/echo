import { computed, ref, shallowReactive } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/stores/authSession';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';
import { resolveEmojiTokens } from '@/services/orchestration/emojiTokenResolve';

const urlByIdState = shallowReactive(new Map<string, string>());
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
        const url = typeof row.imageUrl === 'string' ? row.imageUrl.trim() : '';
        if (!key || !url) continue;
        urlByIdState.set(key, url);
        hit.add(key);
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

  function ensureEmojiId(id: string) {
    const k = normalizeEmojiId(id);
    if (!k) return;
    if (urlByIdState.has(k) || missingIds.has(k)) return;
    pendingIds.add(k);
    if (!auth.isAuthenticated || echoSyncCapabilities.isMockDataMode) return;
    const token = (auth.accessToken ?? '').trim();
    if (!token) return;
    scheduleFlush(token);
  }

  return {
    urlById: computed(() => urlByIdState),
    ensureEmojiId,
    cacheVersion: computed(() => cacheVersion.value),
  };
}
