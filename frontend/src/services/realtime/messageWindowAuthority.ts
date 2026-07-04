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
  anchorId: string | null;
  retainedLoadedRange: { start: number; end: number } | null;
}

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
  public readonly anchorId = ref<string | null>(null);
  public readonly retainedLoadedRange = shallowRef<{
    start: number;
    end: number;
  } | null>(null);

  // Temporary wrapper state
  private channelIndexes = new Map<string, ChannelMessageIndex>();
  private channelHasMoreOlder = new Map<string, boolean>();

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
        topCursor: this.topCursor.value,
        bottomCursor: this.bottomCursor.value,
        note: 'authority snapshot — orderedIds are the only list order source',
      });
    }
  }

  public setHasMoreOlder(channelId: string, hasMore: boolean) {
    this.channelHasMoreOlder.set(channelId, hasMore);
    if (channelId === this.activeChannelId) {
      this.hasMoreOlder.value = hasMore;
    }
  }

  public getHasMoreOlderForChannel(channelId: string): boolean {
    return this.channelHasMoreOlder.get(channelId) ?? true;
  }

  applyEchoChannelClientCap(
    channelId: string,
    activeChannelId: string,
  ): { applied: boolean; refreshHasMoreOlderForActiveChannel: boolean } {
    const rec = this.requireBoundMessages().value;
    const r = applyEchoChannelClientCapToBucket(rec, channelId, {
      activeChannelId,
    });
    if (r.applied) this.updateActiveWindow();
    return r;
  }

  public removeChannelBucket(channelId: string) {
    disposeChannelIndex(channelId);
    this.channelIndexes.delete(channelId);
    this.channelHasMoreOlder.delete(channelId);
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
    this.anchorId.value = null;
    this.retainedLoadedRange.value = null;
    this.channelIndexes.clear();
    this.channelHasMoreOlder.clear();
  }
}

export const messageWindowAuthority = new MessageWindowAuthority();

export const hasActiveMessageWindow = computed(
  () => messageWindowAuthority.orderedIds.value.length > 0,
);
