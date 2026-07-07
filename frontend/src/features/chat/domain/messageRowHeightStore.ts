import type { VirtualItem } from '@tanstack/virtual-core';

export type MessageRowHeightEntry = {
  heightPx: number;
  revisionKey: string;
  measuredAt: number;
};

type ChannelHeightMap = Map<string, MessageRowHeightEntry>;

const MAX_CHANNELS = 80;
const MAX_ENTRIES_PER_CHANNEL = 4000;

/** Session-scoped measured row heights keyed by channel then message id. */
const channelHeights = new Map<string, ChannelHeightMap>();

function touchChannel(channelId: string): ChannelHeightMap {
  const id = channelId.trim();
  let map = channelHeights.get(id);
  if (!map) {
    map = new Map();
    channelHeights.set(id, map);
    pruneChannels();
  }
  return map;
}

function pruneChannels(): void {
  if (channelHeights.size <= MAX_CHANNELS) return;
  const keys = [...channelHeights.keys()];
  for (const key of keys.slice(0, channelHeights.size - MAX_CHANNELS)) {
    channelHeights.delete(key);
  }
}

function pruneChannelEntries(map: ChannelHeightMap): void {
  if (map.size <= MAX_ENTRIES_PER_CHANNEL) return;
  const sorted = [...map.entries()].sort(
    (a, b) => b[1].measuredAt - a[1].measuredAt,
  );
  map.clear();
  for (const [messageId, entry] of sorted.slice(0, MAX_ENTRIES_PER_CHANNEL)) {
    map.set(messageId, entry);
  }
}

export function getMessageRowHeightEntry(
  channelId: string | null | undefined,
  messageId: string | null | undefined,
): MessageRowHeightEntry | null {
  const cid = channelId?.trim();
  const mid = messageId?.trim();
  if (!cid || !mid) return null;
  return channelHeights.get(cid)?.get(mid) ?? null;
}

export function getCachedMessageRowHeightPx(
  channelId: string | null | undefined,
  messageId: string | null | undefined,
  revisionKey: string,
): number | null {
  const entry = getMessageRowHeightEntry(channelId, messageId);
  if (!entry || entry.revisionKey !== revisionKey) return null;
  return entry.heightPx;
}

export function setMessageRowHeightPx(
  channelId: string | null | undefined,
  messageId: string | null | undefined,
  heightPx: number,
  revisionKey: string,
): void {
  const cid = channelId?.trim();
  const mid = messageId?.trim();
  if (!cid || !mid || !Number.isFinite(heightPx) || heightPx <= 0) return;
  const map = touchChannel(cid);
  map.set(mid, {
    heightPx: Math.round(heightPx * 10) / 10,
    revisionKey,
    measuredAt: Date.now(),
  });
  pruneChannelEntries(map);
}

export function clearMessageRowHeightsForChannel(
  channelId: string | null | undefined,
): void {
  const cid = channelId?.trim();
  if (!cid) return;
  channelHeights.delete(cid);
}

export function buildInitialMeasurementsCacheForChannel(
  channelId: string | null | undefined,
  orderedIds: readonly string[],
  estimateSize: (index: number) => number,
): VirtualItem[] {
  const cid = channelId?.trim();
  if (!cid || orderedIds.length === 0) return [];

  const map = channelHeights.get(cid);
  if (!map?.size) return [];

  const items: VirtualItem[] = [];
  let start = 0;
  for (let index = 0; index < orderedIds.length; index++) {
    const messageId = orderedIds[index]?.trim();
    const cached = messageId ? map.get(messageId) : undefined;
    const size = cached?.heightPx ?? estimateSize(index);
    const end = start + size;
    items.push({
      key: messageId ?? index,
      index,
      start,
      end,
      size,
      lane: 0,
    });
    start = end;
  }
  return items;
}

/** Test-only reset. */
export function resetMessageRowHeightStoreForTests(): void {
  channelHeights.clear();
}
