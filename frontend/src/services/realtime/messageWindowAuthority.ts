import { ref, shallowRef, computed, type Ref } from 'vue';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import {
  getChannelIndex,
  disposeChannelIndex,
  type ChannelMessageIndex,
} from '@/services/realtime/channelMessageIndex';
import {
  writeSortedMessagesForChannel,
  applyEchoChannelClientCapToBucket,
} from '@/services/realtime/channelMessageBucket';
import {
  logMessageList,
  messageListDebugEnabled,
} from '@/utils/messageListDebugLog';

/**
 * **Sole authority** for the active channel’s ordered ids + entity map exposed to the list.
 *
 * UI reads `orderedIds` / `entitiesById` here — it does not reconstruct order from scroll,
 * merge realtime vs history, or infer “what’s visible” as truth. See
 * `@/features/chat/domain/viewportContract` for the full viewport laws.
 */

export interface MessageWindow {
  orderedIds: string[];
  entitiesById: Map<string, RawMessage>;
  topCursor: string | null;
  bottomCursor: string | null;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  olderBoundary: MessageBoundaryState;
  newerBoundary: MessageBoundaryState;
  anchorId: string | null;
  retainedLoadedRange: { start: number; end: number } | null;
}

/** Directional history truth; failed remains retryable, reached disables fetches. */
export type MessageBoundaryState = 'unknown' | 'more' | 'reached' | 'failed';

class MessageWindowAuthority {
  private activeChannelId: string | null = null;
  private boundMessages: Ref<Record<string, RawMessage[]>> | null = null;
  /** Run while the outgoing channel is still the active window (before `setActiveChannel` mutates it). */
  private readonly beforeActiveChannelChangeListeners = new Set<() => void>();

  // Expose active window state as refs
  public readonly orderedIds = shallowRef<string[]>([]);
  public readonly entitiesById = shallowRef<Map<string, RawMessage>>(new Map());
  public readonly topCursor = ref<string | null>(null);
  public readonly bottomCursor = ref<string | null>(null);
  public readonly hasMoreOlder = ref(true);
  public readonly hasMoreNewer = ref(false);
  public readonly olderBoundary = ref<MessageBoundaryState>('unknown');
  public readonly newerBoundary = ref<MessageBoundaryState>('reached');
  public readonly anchorId = ref<string | null>(null);
  public readonly retainedLoadedRange = shallowRef<{
    start: number;
    end: number;
  } | null>(null);

  // Temporary wrapper state
  private channelIndexes = new Map<string, ChannelMessageIndex>();
  private channelHasMoreOlder = new Map<string, boolean>();
  private channelOlderBoundary = new Map<string, MessageBoundaryState>();
  private channelNewerBoundary = new Map<string, MessageBoundaryState>();
  private channelOlderCache = new Map<string, RawMessage[]>();
  private static readonly maxOlderCacheRowsPerChannel = 160;

  public bindMessages(messages: Ref<Record<string, RawMessage[]>>) {
    this.boundMessages = messages;
  }

  private requireBoundMessages(): Ref<Record<string, RawMessage[]>> {
    if (this.boundMessages) return this.boundMessages;
    throw new Error(
      'MessageWindowAuthority is not bound. Call bindMessages() during init.',
    );
  }

  /**
   * Subscribe to runs immediately before the active channel id changes.
   * Use this to snapshot UI that depends on the current active window (e.g. scroll position).
   * Returns an unsubscribe function.
   */
  onBeforeActiveChannelChange(fn: () => void): () => void {
    this.beforeActiveChannelChangeListeners.add(fn);
    return () => this.beforeActiveChannelChangeListeners.delete(fn);
  }

  setActiveChannel(channelId: string | null) {
    if (this.activeChannelId !== channelId) {
      for (const fn of this.beforeActiveChannelChangeListeners) {
        try {
          fn();
        } catch (e) {
          console.error(
            '[messageWindowAuthority] beforeChannelChange listener',
            e,
          );
        }
      }
    }
    this.activeChannelId = channelId;
    this.updateActiveWindow();
  }

  public getActiveChannelId(): string | null {
    return this.activeChannelId;
  }

  public ensureChannelBucket(channelId: string): RawMessage[] {
    const rec = this.requireBoundMessages().value;
    const existing = rec[channelId];
    if (existing) return existing;
    const next: RawMessage[] = [];
    rec[channelId] = next;
    return next;
  }

  public getIndex(channelId: string): ChannelMessageIndex {
    let index = this.channelIndexes.get(channelId);
    if (!index) {
      const list = this.ensureChannelBucket(channelId);
      index = getChannelIndex(channelId, list);
      this.channelIndexes.set(channelId, index);
    }
    return index;
  }

  /** Channel ids with at least one row in the bound workspace message record. */
  public listCachedChannelIds(): string[] {
    const rec = this.boundMessages?.value;
    if (!rec) return [];
    return Object.keys(rec).filter(
      (channelId) => (rec[channelId]?.length ?? 0) > 0,
    );
  }

  public syncChannelMessages(
    channelId: string,
    index: ChannelMessageIndex,
  ): RawMessage[] {
    const rec = this.requireBoundMessages().value;
    const synced = writeSortedMessagesForChannel(rec, channelId, index);
    if (channelId === this.activeChannelId) {
      this.updateActiveWindow();
    }
    return synced;
  }

  /** Rebuild the active window from the channel index (e.g. after an in-place message patch). */
  public refreshActiveWindow() {
    this.updateActiveWindow();
  }

  private updateActiveWindow() {
    if (!this.activeChannelId) {
      this.orderedIds.value = [];
      this.entitiesById.value = new Map();
      this.topCursor.value = null;
      this.bottomCursor.value = null;
      this.hasMoreOlder.value = true;
      this.hasMoreNewer.value = false;
      this.olderBoundary.value = 'unknown';
      this.newerBoundary.value = 'reached';
      if (messageListDebugEnabled()) {
        logMessageList('window', 'active_window_updated', {
          activeChannelId: null,
          orderedCount: 0,
          firstMessageId: null,
          lastMessageId: null,
          hasMoreOlder: true,
          topCursor: null,
          bottomCursor: null,
          note: 'authority snapshot — no active channel',
        });
      }
      return;
    }

    const index = this.getIndex(this.activeChannelId);
    const sorted = index.sorted.value;

    this.orderedIds.value = sorted.map((m) => m.id!);
    this.entitiesById.value = new Map(index.byId);
    this.hasMoreOlder.value =
      this.channelHasMoreOlder.get(this.activeChannelId) ?? true;
    this.olderBoundary.value =
      this.channelOlderBoundary.get(this.activeChannelId) ??
      (this.hasMoreOlder.value ? 'unknown' : 'reached');
    this.newerBoundary.value =
      this.channelNewerBoundary.get(this.activeChannelId) ?? 'reached';
    this.hasMoreNewer.value = this.newerBoundary.value !== 'reached';

    if (sorted.length > 0) {
      this.topCursor.value = sorted[0].id ?? null;
      this.bottomCursor.value = sorted[sorted.length - 1].id ?? null;
    } else {
      this.topCursor.value = null;
      this.bottomCursor.value = null;
    }

    if (messageListDebugEnabled()) {
      const ids = this.orderedIds.value;
      logMessageList('window', 'active_window_updated', {
        activeChannelId: this.activeChannelId,
        orderedCount: ids.length,
        firstMessageId: ids[0] ?? null,
        lastMessageId: ids.length > 0 ? ids[ids.length - 1]! : null,
        hasMoreOlder: this.hasMoreOlder.value,
        olderBoundary: this.olderBoundary.value,
        newerBoundary: this.newerBoundary.value,
        topCursor: this.topCursor.value,
        bottomCursor: this.bottomCursor.value,
        note: 'authority snapshot — orderedIds are the only list order source',
      });
    }
  }

  public setHasMoreOlder(channelId: string, hasMore: boolean) {
    this.channelHasMoreOlder.set(channelId, hasMore);
    this.channelOlderBoundary.set(channelId, hasMore ? 'more' : 'reached');
    if (channelId === this.activeChannelId) {
      this.hasMoreOlder.value = hasMore;
      this.olderBoundary.value = hasMore ? 'more' : 'reached';
    }
  }

  public setBoundary(
    channelId: string,
    direction: 'older' | 'newer',
    state: MessageBoundaryState,
  ): void {
    const hasMore = state !== 'reached';
    if (direction === 'older') {
      this.channelOlderBoundary.set(channelId, state);
      this.channelHasMoreOlder.set(channelId, hasMore);
      if (channelId === this.activeChannelId) {
        this.olderBoundary.value = state;
        this.hasMoreOlder.value = hasMore;
      }
      return;
    }
    this.channelNewerBoundary.set(channelId, state);
    if (channelId === this.activeChannelId) {
      this.newerBoundary.value = state;
      this.hasMoreNewer.value = hasMore;
    }
  }

  public setHasMoreNewer(channelId: string, hasMore: boolean): void {
    this.setBoundary(channelId, 'newer', hasMore ? 'more' : 'reached');
  }

  public getBoundary(
    channelId: string,
    direction: 'older' | 'newer',
  ): MessageBoundaryState {
    if (direction === 'older') {
      return (
        this.channelOlderBoundary.get(channelId) ??
        (this.channelHasMoreOlder.get(channelId) === false
          ? 'reached'
          : 'unknown')
      );
    }
    return this.channelNewerBoundary.get(channelId) ?? 'reached';
  }

  public getHasMoreOlderForChannel(channelId: string): boolean {
    return this.channelHasMoreOlder.get(channelId) ?? true;
  }

  /** Take recently evicted older rows before going to the network. */
  public takeCachedOlder(channelId: string, limit: number): RawMessage[] {
    const cache = this.channelOlderCache.get(channelId) ?? [];
    if (cache.length === 0 || limit <= 0) return [];
    const count = Math.min(limit, cache.length);
    const rows = cache.splice(Math.max(0, cache.length - count), count);
    if (cache.length === 0) this.channelOlderCache.delete(channelId);
    else this.channelOlderCache.set(channelId, cache);
    return rows;
  }

  public hasCachedOlder(channelId: string): boolean {
    return (this.channelOlderCache.get(channelId)?.length ?? 0) > 0;
  }

  applyEchoChannelClientCap(
    channelId: string,
    activeChannelId: string,
  ): {
    applied: boolean;
    refreshHasMoreOlderForActiveChannel: boolean;
    evictedHead: RawMessage[];
  } {
    const rec = this.requireBoundMessages().value;
    const r = applyEchoChannelClientCapToBucket(rec, channelId, {
      activeChannelId,
    });
    if (r.evictedHead.length > 0) {
      const existing = this.channelOlderCache.get(channelId) ?? [];
      const seen = new Set(existing.map((m) => m.id));
      const merged = [
        ...existing,
        ...r.evictedHead.filter((m) => m.id && !seen.has(m.id)),
      ];
      this.channelOlderCache.set(
        channelId,
        merged.slice(-MessageWindowAuthority.maxOlderCacheRowsPerChannel),
      );
    }
    if (r.applied) this.updateActiveWindow();
    return r;
  }

  public removeChannelBucket(channelId: string) {
    disposeChannelIndex(channelId);
    this.channelIndexes.delete(channelId);
    this.channelHasMoreOlder.delete(channelId);
    this.channelOlderBoundary.delete(channelId);
    this.channelNewerBoundary.delete(channelId);
    this.channelOlderCache.delete(channelId);
    if (this.boundMessages) {
      delete this.boundMessages.value[channelId];
    }
    if (channelId === this.activeChannelId) {
      this.updateActiveWindow();
    }
  }

  public removeChannelBucketsForIds(channelIds: string[]) {
    if (channelIds.length === 0) return;
    const r = this.requireBoundMessages();
    const next = { ...r.value };
    for (const id of channelIds) {
      disposeChannelIndex(id);
      this.channelIndexes.delete(id);
      this.channelHasMoreOlder.delete(id);
      this.channelOlderBoundary.delete(id);
      this.channelNewerBoundary.delete(id);
      this.channelOlderCache.delete(id);
      delete next[id];
    }
    r.value = next;
    if (this.activeChannelId && channelIds.includes(this.activeChannelId)) {
      this.updateActiveWindow();
    }
  }

  public replaceWorkspaceMessagesSnapshot(next: Record<string, RawMessage[]>) {
    const r = this.requireBoundMessages();
    const prevIds = Object.keys(r.value);
    const nextIds = new Set(Object.keys(next));
    for (const channelId of prevIds) {
      if (!nextIds.has(channelId)) {
        disposeChannelIndex(channelId);
        this.channelIndexes.delete(channelId);
        this.channelHasMoreOlder.delete(channelId);
        this.channelOlderBoundary.delete(channelId);
        this.channelNewerBoundary.delete(channelId);
        this.channelOlderCache.delete(channelId);
      }
    }
    r.value = next;
    this.updateActiveWindow();
  }

  public clearWorkspaceMessagesRecord() {
    if (!this.boundMessages) return;
    const r = this.requireBoundMessages();
    for (const channelId of Object.keys(r.value)) {
      disposeChannelIndex(channelId);
    }
    this.channelIndexes.clear();
    this.channelHasMoreOlder.clear();
    this.channelOlderBoundary.clear();
    this.channelNewerBoundary.clear();
    this.channelOlderCache.clear();
    r.value = {};
    this.updateActiveWindow();
  }

  /** Vitest only. */
  public _resetForTesting() {
    this.beforeActiveChannelChangeListeners.clear();
    this.activeChannelId = null;
    this.boundMessages = null;
    this.orderedIds.value = [];
    this.entitiesById.value = new Map();
    this.topCursor.value = null;
    this.bottomCursor.value = null;
    this.hasMoreOlder.value = true;
    this.hasMoreNewer.value = false;
    this.olderBoundary.value = 'unknown';
    this.newerBoundary.value = 'reached';
    this.anchorId.value = null;
    this.retainedLoadedRange.value = null;
    this.channelIndexes.clear();
    this.channelHasMoreOlder.clear();
    this.channelOlderBoundary.clear();
    this.channelNewerBoundary.clear();
    this.channelOlderCache.clear();
  }
}

export const messageWindowAuthority = new MessageWindowAuthority();

export const hasActiveMessageWindow = computed(
  () => messageWindowAuthority.orderedIds.value.length > 0,
);
