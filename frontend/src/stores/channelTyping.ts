import { defineStore } from 'pinia';
import { ref } from 'vue';

/** How long a peer stays “typing” without another pulse from the server. */
const TYPING_TTL_MS = 9000;

export type ChannelTypingUser = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  expiresAt: number;
};

let socketEmitChannelTyping: ((channelId: string) => void) | null = null;

/** Wired from `useSocket` when the realtime client connects. */
export function registerChannelTypingSocketEmit(
  fn: ((channelId: string) => void) | null,
) {
  socketEmitChannelTyping = fn;
}

/** Client → server debounced pulse (store avoids coupling ChatInput to `useSocket`). */
export function emitChannelTypingPulse(channelId: string) {
  const cid = channelId.trim();
  if (!cid) return;
  socketEmitChannelTyping?.(cid);
}

export const useChannelTypingStore = defineStore('channelTyping', () => {
  const typersByChannel = ref<Record<string, ChannelTypingUser[]>>({});

  let pruneTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelPruneTimer() {
    if (!pruneTimer) return;
    clearTimeout(pruneTimer);
    pruneTimer = null;
  }

  function activeUsers(
    list: ChannelTypingUser[] | undefined,
    now: number,
  ): ChannelTypingUser[] {
    if (!list?.length) return [];
    return list.filter((u) => u.expiresAt > now);
  }

  function nextExpiryMs(): number | null {
    let min = Number.POSITIVE_INFINITY;
    for (const list of Object.values(typersByChannel.value)) {
      for (const u of list) {
        if (u.expiresAt < min) min = u.expiresAt;
      }
    }
    return Number.isFinite(min) ? min : null;
  }

  function schedulePrune() {
    cancelPruneTimer();
    const nextExpiry = nextExpiryMs();
    if (nextExpiry == null) return;
    const delay = Math.max(0, nextExpiry - Date.now() + 5);
    pruneTimer = setTimeout(() => {
      pruneTimer = null;
      pruneExpired();
    }, delay);
  }

  function pruneExpired(now = Date.now()) {
    const next: Record<string, ChannelTypingUser[]> = {};
    let changed = false;
    for (const [cid, list] of Object.entries(typersByChannel.value)) {
      const kept = activeUsers(list, now);
      if (kept.length !== list.length) changed = true;
      if (kept.length) next[cid] = kept;
    }
    if (
      changed ||
      Object.keys(next).length !== Object.keys(typersByChannel.value).length
    ) {
      typersByChannel.value = next;
    }
    schedulePrune();
  }

  function ingestRemote(payload: {
    channelId: string;
    userId: string;
    displayName: string;
    avatarUrl: string;
  }) {
    const now = Date.now();
    const { channelId, userId, displayName, avatarUrl } = payload;
    const list = typersByChannel.value[channelId] ?? [];
    const merged = activeUsers(list, now).filter((u) => u.userId !== userId);
    merged.push({
      userId,
      displayName: displayName.trim() || 'Someone',
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl.trim() : '',
      expiresAt: now + TYPING_TTL_MS,
    });
    typersByChannel.value = { ...typersByChannel.value, [channelId]: merged };
    schedulePrune();
  }

  function typersFor(
    channelId: string | undefined,
    excludeUserId?: string,
  ): ChannelTypingUser[] {
    if (!channelId) return [];
    const now = Date.now();
    return activeUsers(typersByChannel.value[channelId], now)
      .filter((u) => u.userId !== excludeUserId)
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
        }),
      );
  }

  function clearChannel(channelId: string) {
    const cid = channelId.trim();
    if (!cid) return;
    const { [cid]: _, ...rest } = typersByChannel.value;
    typersByChannel.value = rest;
    schedulePrune();
  }

  function reset() {
    cancelPruneTimer();
    typersByChannel.value = {};
  }

  return {
    typersByChannel,
    ingestRemote,
    typersFor,
    clearChannel,
    pruneExpired,
    reset,
  };
});
