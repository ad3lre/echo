import { computed, ref, shallowRef, type Ref } from 'vue';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { compareRawMessagesChronologically } from '@/services/realtime/channelMessageOrder';

const ORDER_KEY_SEP = '\x1e';

function extractImageUrls(msg: RawMessage): string[] {
  const urls: string[] = [];
  if (msg.imageUrl) urls.push(msg.imageUrl);
  if (msg.stickers) {
    for (const sticker of msg.stickers) {
      if (!sticker?.url || sticker.format === 'lottie') continue;
      urls.push(sticker.url);
    }
  }
  if (msg.attachments) {
    for (const a of msg.attachments) {
      if (!a.url) continue;
      const mime = (a.mimeType ?? '').toLowerCase();
      const name = (a.filename ?? '').toLowerCase();
      if (
        mime.startsWith('video/') ||
        name.endsWith('.mp4') ||
        name.endsWith('.webm') ||
        name.endsWith('.mov')
      ) {
        continue;
      }
      urls.push(a.url);
    }
  }
  return urls;
}

function binaryInsertionIndex(
  sorted: readonly RawMessage[],
  msg: RawMessage,
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareRawMessagesChronologically(sorted[mid], msg) <= 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export interface ChannelMessageIndex {
  readonly sorted: Readonly<Ref<readonly RawMessage[]>>;
  readonly byId: ReadonlyMap<string, RawMessage>;
  readonly imageUrls: Readonly<Ref<readonly string[]>>;
  readonly authorIds: ReadonlySet<string>;
  readonly orderKey: Readonly<Ref<string>>;
  readonly orderRevision: Readonly<Ref<number>>;
  readonly resolverVersion: Readonly<Ref<number>>;

  insert(msg: RawMessage): void;
  mergeBatch(
    msgs: RawMessage[],
    position: 'append' | 'prepend' | 'replace',
  ): void;
  trimHead(removeCount: number): boolean;
  update(id: string, patch: Partial<RawMessage>): void;
  remove(id: string): void;
}

function buildOrderKey(sorted: readonly RawMessage[]): string {
  let key = '';
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0) key += ORDER_KEY_SEP;
    key += sorted[i].id ?? '';
  }
  return key;
}

function hasSameMessageSnapshot(
  a: readonly RawMessage[],
  b: readonly RawMessage[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function createChannelMessageIndex(
  initial: RawMessage[],
  onAuthorsChanged?: (
    prev: ReadonlySet<string>,
    next: ReadonlySet<string>,
  ) => void,
): ChannelMessageIndex {
  const sortedArr = [...initial].sort(compareRawMessagesChronologically);

  const sortedRef = shallowRef<readonly RawMessage[]>(sortedArr);
  const byId = new Map<string, RawMessage>();
  const imageUrlRefCount = new Map<string, number>();
  const imageUrlsRef = shallowRef<readonly string[]>([]);
  const authorIds = new Set<string>();
  const authorRefCount = new Map<string, number>();
  const orderRevisionRef = ref(0);
  const orderKeyRef = computed(() => buildOrderKey(sortedRef.value));
  const resolverVersionRef = ref(0);

  for (const m of sortedArr) {
    if (m.id) byId.set(m.id, m);
    if (m.authorId) {
      authorIds.add(m.authorId);
      authorRefCount.set(m.authorId, (authorRefCount.get(m.authorId) ?? 0) + 1);
    }
    for (const url of extractImageUrls(m)) {
      const nextCount = (imageUrlRefCount.get(url) ?? 0) + 1;
      imageUrlRefCount.set(url, nextCount);
      if (nextCount === 1) {
        imageUrlsRef.value = [...imageUrlsRef.value, url];
      }
    }
  }

  function notifyAuthorsChanged(prev: ReadonlySet<string>) {
    if (prev.size !== authorIds.size) {
      onAuthorsChanged?.(prev, authorIds);
      return;
    }
    for (const id of prev) {
      if (!authorIds.has(id)) {
        onAuthorsChanged?.(prev, authorIds);
        return;
      }
    }
  }

  function rebuildOrderSignals() {
    orderRevisionRef.value += 1;
  }

  function incrementAuthor(authorId: string | undefined) {
    if (!authorId) return;
    const prev = authorRefCount.get(authorId) ?? 0;
    authorRefCount.set(authorId, prev + 1);
    if (prev === 0) authorIds.add(authorId);
  }

  function decrementAuthor(authorId: string | undefined) {
    if (!authorId) return;
    const prev = authorRefCount.get(authorId) ?? 0;
    if (prev <= 1) {
      authorRefCount.delete(authorId);
      authorIds.delete(authorId);
      return;
    }
    authorRefCount.set(authorId, prev - 1);
  }

  function incrementImageUrls(msg: RawMessage) {
    let nextList = imageUrlsRef.value as string[];
    let changed = false;
    for (const url of extractImageUrls(msg)) {
      const prev = imageUrlRefCount.get(url) ?? 0;
      imageUrlRefCount.set(url, prev + 1);
      if (prev === 0) {
        if (!changed) {
          nextList = [...imageUrlsRef.value];
          changed = true;
        }
        nextList.push(url);
      }
    }
    if (changed) imageUrlsRef.value = nextList;
  }

  function decrementImageUrls(msg: RawMessage) {
    let nextList: string[] | null = null;
    for (const url of extractImageUrls(msg)) {
      const prev = imageUrlRefCount.get(url) ?? 0;
      if (prev <= 1) {
        imageUrlRefCount.delete(url);
        if (nextList == null) {
          nextList = imageUrlsRef.value.filter((x) => x !== url);
        } else {
          nextList = nextList.filter((x) => x !== url);
        }
      } else {
        imageUrlRefCount.set(url, prev - 1);
      }
    }
    if (nextList != null) imageUrlsRef.value = nextList;
  }

  function replaceAtSamePosition(id: string, next: RawMessage): boolean {
    const arr = sortedRef.value as RawMessage[];
    const idx = arr.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    const prev = arr[idx];
    const patched = [...arr];
    patched[idx] = next;
    sortedRef.value = patched;

    const prevAuthors = new Set(authorIds);
    decrementAuthor(prev.authorId);
    incrementAuthor(next.authorId);
    decrementImageUrls(prev);
    incrementImageUrls(next);
    byId.set(id, next);
    notifyAuthorsChanged(prevAuthors);
    return true;
  }

  function fullRebuildFromSorted() {
    const prevAuthors = new Set(authorIds);
    byId.clear();
    authorIds.clear();
    authorRefCount.clear();
    imageUrlRefCount.clear();
    imageUrlsRef.value = [];
    for (const m of sortedRef.value) {
      if (m.id) byId.set(m.id, m);
      incrementAuthor(m.authorId);
      incrementImageUrls(m);
    }
    notifyAuthorsChanged(prevAuthors);
    rebuildOrderSignals();
  }

  function insert(msg: RawMessage): void {
    const arr = [...sortedRef.value];
    const pos = binaryInsertionIndex(arr, msg);
    arr.splice(pos, 0, msg);
    sortedRef.value = arr;
    const prevAuthors = new Set(authorIds);
    if (msg.id) byId.set(msg.id, msg);
    incrementAuthor(msg.authorId);
    incrementImageUrls(msg);
    notifyAuthorsChanged(prevAuthors);
    rebuildOrderSignals();
  }

  function applyIncrementalBatch(
    merged: RawMessage[],
    deduped: RawMessage[],
  ): void {
    sortedRef.value = merged;
    const prevAuthors = new Set(authorIds);
    for (const msg of deduped) {
      if (msg.id) byId.set(msg.id, msg);
      incrementAuthor(msg.authorId);
      incrementImageUrls(msg);
    }
    notifyAuthorsChanged(prevAuthors);
    rebuildOrderSignals();
  }

  function mergeBatch(
    msgs: RawMessage[],
    position: 'append' | 'prepend' | 'replace',
  ): void {
    const incomingSorted = [...msgs].sort(compareRawMessagesChronologically);
    if (position === 'replace') {
      sortedRef.value = incomingSorted;
      fullRebuildFromSorted();
      return;
    }

    const existingIds = new Set(byId.keys());
    const deduped = incomingSorted.filter(
      (m) => !m.id || !existingIds.has(m.id),
    );
    if (deduped.length === 0) return;

    let merged: RawMessage[];
    if (position === 'prepend') {
      merged = [...deduped, ...sortedRef.value];
      const prependAlreadyOrdered =
        deduped.length === 0 ||
        sortedRef.value.length === 0 ||
        compareRawMessagesChronologically(
          deduped[deduped.length - 1],
          sortedRef.value[0],
        ) <= 0;
      if (!prependAlreadyOrdered) {
        merged.sort(compareRawMessagesChronologically);
      }
    } else {
      merged = [...sortedRef.value, ...deduped];
      const appendAlreadyOrdered =
        sortedRef.value.length === 0 ||
        deduped.length === 0 ||
        compareRawMessagesChronologically(
          sortedRef.value[sortedRef.value.length - 1],
          deduped[0],
        ) <= 0;
      if (!appendAlreadyOrdered) {
        merged.sort(compareRawMessagesChronologically);
      }
    }

    applyIncrementalBatch(merged, deduped);
  }

  function trimHead(removeCount: number): boolean {
    if (removeCount <= 0 || sortedRef.value.length === 0) return false;
    const removed = sortedRef.value.slice(0, removeCount);
    if (removed.length === 0) return false;
    sortedRef.value = sortedRef.value.slice(removed.length);
    const prevAuthors = new Set(authorIds);
    for (const msg of removed) {
      if (msg.id) byId.delete(msg.id);
      decrementAuthor(msg.authorId);
      decrementImageUrls(msg);
    }
    notifyAuthorsChanged(prevAuthors);
    rebuildOrderSignals();
    return true;
  }

  function update(id: string, patch: Partial<RawMessage>): void {
    const existing = byId.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    replaceAtSamePosition(id, updated);
  }

  function remove(id: string): void {
    const prev = byId.get(id);
    if (!prev) return;
    sortedRef.value = sortedRef.value.filter((m) => m.id !== id);
    const prevAuthors = new Set(authorIds);
    byId.delete(id);
    decrementAuthor(prev.authorId);
    decrementImageUrls(prev);
    notifyAuthorsChanged(prevAuthors);
    rebuildOrderSignals();
  }

  return {
    sorted: sortedRef,
    byId,
    imageUrls: imageUrlsRef,
    authorIds,
    orderKey: orderKeyRef,
    orderRevision: orderRevisionRef,
    resolverVersion: resolverVersionRef,
    insert,
    mergeBatch,
    trimHead,
    update,
    remove,
  };
}

const indexMap = new Map<string, ChannelMessageIndex>();
const globalAuthorIdSet = new Set<string>();
const globalAuthorRefCount = new Map<string, number>();
const resolverVersionRef = ref(0);

function reconcileGlobalAuthors(
  prev: ReadonlySet<string>,
  next: ReadonlySet<string>,
): void {
  for (const id of prev) {
    if (next.has(id)) continue;
    const count = globalAuthorRefCount.get(id) ?? 0;
    if (count <= 1) {
      globalAuthorRefCount.delete(id);
      globalAuthorIdSet.delete(id);
    } else {
      globalAuthorRefCount.set(id, count - 1);
    }
  }
  for (const id of next) {
    if (prev.has(id)) continue;
    const count = (globalAuthorRefCount.get(id) ?? 0) + 1;
    globalAuthorRefCount.set(id, count);
    globalAuthorIdSet.add(id);
  }
}

function addIndexAuthorsToGlobal(ids: ReadonlySet<string>): void {
  for (const id of ids) {
    const count = (globalAuthorRefCount.get(id) ?? 0) + 1;
    globalAuthorRefCount.set(id, count);
    globalAuthorIdSet.add(id);
  }
}

export function getChannelIndex(
  channelId: string,
  initialMessages?: RawMessage[],
): ChannelMessageIndex {
  let index = indexMap.get(channelId);
  if (!index) {
    index = createChannelMessageIndex(
      initialMessages ?? [],
      reconcileGlobalAuthors,
    );
    indexMap.set(channelId, index);
    addIndexAuthorsToGlobal(index.authorIds);
  } else if (
    initialMessages &&
    !hasSameMessageSnapshot(index.sorted.value, initialMessages)
  ) {
    index.mergeBatch(initialMessages, 'replace');
  }
  return index;
}

export function disposeChannelIndex(channelId: string): void {
  const existing = indexMap.get(channelId);
  indexMap.delete(channelId);
  if (!existing) return;
  for (const id of existing.authorIds) {
    const count = globalAuthorRefCount.get(id) ?? 0;
    if (count <= 1) {
      globalAuthorRefCount.delete(id);
      globalAuthorIdSet.delete(id);
    } else {
      globalAuthorRefCount.set(id, count - 1);
    }
  }
}

export function bumpResolverVersion(): void {
  resolverVersionRef.value += 1;
  for (const index of indexMap.values()) {
    (index.resolverVersion as Ref<number>).value = resolverVersionRef.value;
  }
}

export const globalAuthorIds: ReadonlySet<string> = globalAuthorIdSet;
export const resolverVersion: Readonly<Ref<number>> = resolverVersionRef;

export function getActiveIndexMap(): ReadonlyMap<string, ChannelMessageIndex> {
  return indexMap;
}

/** Vitest only. */
export function _resetAllIndexesForTesting(): void {
  indexMap.clear();
  globalAuthorIdSet.clear();
  globalAuthorRefCount.clear();
}
