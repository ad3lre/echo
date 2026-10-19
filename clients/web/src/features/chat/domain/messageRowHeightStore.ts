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
  // Height pruning is bounded maintenance for one capped channel map.
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

export function invalidateMessageRowHeight(
  channelId: string | null | undefined,
  messageId: string | null | undefined,
): void {
  const cid = channelId?.trim();
  const mid = messageId?.trim();
  if (!cid || !mid) return;
  channelHeights.get(cid)?.delete(mid);
}

export function buildInitialMeasurementsCacheForChannel(
  channelId: string | null | undefined,
  orderedIds: readonly string[],
  estimateSize: (index: number) => number,
  hasCachedMeasurement?: (index: number) => boolean,
): VirtualItem[] {
  const cid = channelId?.trim();
  if (!cid || orderedIds.length === 0) return [];

  const map = channelHeights.get(cid);
  if (!map?.size) return [];

  const items: VirtualItem[] = [];
  let start = 0;
  let measuredCount = 0;
  for (let index = 0; index < orderedIds.length; index++) {
    const messageId = orderedIds[index]?.trim();
    const hasMeasured = hasCachedMeasurement?.(index) ?? false;
    if (hasMeasured) measuredCount += 1;
    const size = estimateSize(index);
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
  if (hasCachedMeasurement) {
    return measuredCount > 0 ? items : [];
  }
  return items;
}

/**
 * Incremental TanStack measurements update for pure prepend/append (or
 * drop-from-start/end). Returns `null` when the id delta is not a simple edge
 * splice — callers should fall back to a full rebuild.
 *
 * Keeps measured sizes for stable rows; only `estimateSize`s newly introduced
 * indices.
 */
export function trySpliceVirtualMeasurementsCache(
  prevIds: readonly string[],
  nextIds: readonly string[],
  prevCache: readonly VirtualItem[],
  estimateSize: (index: number) => number,
): VirtualItem[] | null {
  if (prevIds.length === 0 || nextIds.length === 0) return null;
  if (prevCache.length !== prevIds.length) return null;

  if (prevIds.length === nextIds.length) {
    for (let i = 0; i < prevIds.length; i++) {
      if (prevIds[i] !== nextIds[i]) return null;
    }
    return prevCache as VirtualItem[];
  }

  if (nextIds.length > prevIds.length) {
    const added = nextIds.length - prevIds.length;
    let isPrepend = true;
    for (let i = 0; i < prevIds.length; i++) {
      if (nextIds[i + added] !== prevIds[i]) {
        isPrepend = false;
        break;
      }
    }
    if (isPrepend) {
      const head: VirtualItem[] = [];
      let start = 0;
      for (let i = 0; i < added; i++) {
        const size = estimateSize(i);
        const end = start + size;
        head.push({
          key: nextIds[i] ?? i,
          index: i,
          start,
          end,
          size,
          lane: 0,
        });
        start = end;
      }
      const shiftPx = start;
      const tail = prevCache.map((item, j) => ({
        ...item,
        index: j + added,
        start: item.start + shiftPx,
        end: item.end + shiftPx,
        key: nextIds[j + added] ?? item.key,
      }));
      return [...head, ...tail];
    }

    let isAppend = true;
    for (let i = 0; i < prevIds.length; i++) {
      if (nextIds[i] !== prevIds[i]) {
        isAppend = false;
        break;
      }
    }
    if (isAppend) {
      const out = prevCache.slice();
      let start = prevCache[prevCache.length - 1]?.end ?? 0;
      for (let i = prevIds.length; i < nextIds.length; i++) {
        const size = estimateSize(i);
        const end = start + size;
        out.push({
          key: nextIds[i] ?? i,
          index: i,
          start,
          end,
          size,
          lane: 0,
        });
        start = end;
      }
      return out;
    }
    return null;
  }

  const removed = prevIds.length - nextIds.length;
  let dropStart = true;
  for (let i = 0; i < nextIds.length; i++) {
    if (nextIds[i] !== prevIds[i + removed]) {
      dropStart = false;
      break;
    }
  }
  if (dropStart) {
    const firstKept = prevCache[removed];
    if (!firstKept) return [];
    const shiftPx = firstKept.start;
    return prevCache.slice(removed).map((item, j) => ({
      ...item,
      index: j,
      start: item.start - shiftPx,
      end: item.end - shiftPx,
      key: nextIds[j] ?? item.key,
    }));
  }

  let dropEnd = true;
  for (let i = 0; i < nextIds.length; i++) {
    if (nextIds[i] !== prevIds[i]) {
      dropEnd = false;
      break;
    }
  }
  if (dropEnd) {
    return prevCache.slice(0, nextIds.length);
  }
  return null;
}

/** Test-only reset. */
export function resetMessageRowHeightStoreForTests(): void {
  channelHeights.clear();
}
