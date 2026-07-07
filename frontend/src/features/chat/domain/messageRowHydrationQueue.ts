export type MessageRowHydrationQueueOptions = {
  maxBatchSize: number;
  maxQueueSize: number;
};

const DEFAULT_OPTIONS: MessageRowHydrationQueueOptions = {
  maxBatchSize: 8,
  maxQueueSize: 240,
};

export function createMessageRowHydrationQueue(
  options: Partial<MessageRowHydrationQueueOptions> = {},
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const hydrated = new Set<string>();
  const queued: string[] = [];
  const queuedSet = new Set<string>();

  function keyFor(channelId: string, messageId: string): string {
    return `${channelId.trim()}:${messageId.trim()}`;
  }

  function isHydrated(channelId: string, messageId: string): boolean {
    const k = keyFor(channelId, messageId);
    return hydrated.has(k);
  }

  function markHydrated(channelId: string, messageId: string): void {
    const k = keyFor(channelId, messageId);
    hydrated.add(k);
    if (queuedSet.has(k)) {
      queuedSet.delete(k);
      const idx = queued.indexOf(k);
      if (idx >= 0) queued.splice(idx, 1);
    }
  }

  function seedHydrated(
    channelId: string,
    messageIds: readonly string[],
  ): void {
    const cid = channelId.trim();
    if (!cid) return;
    for (const messageId of messageIds) {
      const mid = messageId?.trim();
      if (!mid) continue;
      hydrated.add(keyFor(cid, mid));
    }
  }

  function enqueue(channelId: string, messageIds: readonly string[]): string[] {
    const cid = channelId.trim();
    if (!cid) return [];
    const added: string[] = [];
    for (const messageId of messageIds) {
      const mid = messageId?.trim();
      if (!mid) continue;
      const k = keyFor(cid, mid);
      if (hydrated.has(k) || queuedSet.has(k)) continue;
      if (queued.length >= opts.maxQueueSize) break;
      queued.push(k);
      queuedSet.add(k);
      added.push(mid);
    }
    return added;
  }

  function dequeueBatch(channelId: string): string[] {
    const cid = channelId.trim();
    if (!cid || queued.length === 0) return [];
    const prefix = `${cid}:`;
    const batch: string[] = [];
    let i = 0;
    while (i < queued.length && batch.length < opts.maxBatchSize) {
      const k = queued[i]!;
      if (!k.startsWith(prefix)) {
        i++;
        continue;
      }
      queued.splice(i, 1);
      queuedSet.delete(k);
      const messageId = k.slice(prefix.length);
      hydrated.add(k);
      batch.push(messageId);
    }
    return batch;
  }

  function clearChannel(channelId: string): void {
    const cid = channelId.trim();
    if (!cid) return;
    const prefix = `${cid}:`;
    for (const k of [...hydrated]) {
      if (k.startsWith(prefix)) hydrated.delete(k);
    }
    for (let i = queued.length - 1; i >= 0; i--) {
      const k = queued[i]!;
      if (k.startsWith(prefix)) {
        queued.splice(i, 1);
        queuedSet.delete(k);
      }
    }
  }

  function reset(): void {
    hydrated.clear();
    queued.length = 0;
    queuedSet.clear();
  }

  return {
    isHydrated,
    markHydrated,
    seedHydrated,
    enqueue,
    dequeueBatch,
    clearChannel,
    reset,
    get queueLength() {
      return queued.length;
    },
    get hydratedCount() {
      return hydrated.size;
    },
  };
}

export type MessageRowHydrationQueue = ReturnType<
  typeof createMessageRowHydrationQueue
>;
