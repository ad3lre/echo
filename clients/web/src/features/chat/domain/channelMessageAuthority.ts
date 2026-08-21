import type { MessageReaction } from '@shared/types';
import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { type ChannelMessageIndex } from '@/features/chat/domain/channelMessageIndex';
import { writeSortedMessagesForChannel } from '@/features/chat/domain/channelMessageBucket';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';

/**
 * Single client-side write surface for channel message lists:
 * mutate `ChannelMessageIndex` for ordering/identity, then call `syncChannelMessages`
 * (or use `replaceChannelMessagesFromHistory` / `mergeMissingChannelMessagesFromHistory` /
 * `prependChannelMessagesFromHistory`). Replace is empty-index only; see
 * `docs/architecture/channel-history-merge-invariants.md`.
 * Do not assign `messages[channelId]` directly outside this module’s helpers.
 *
 * Ordering truth flows here → `messageWindowAuthority`; see
 * `@/features/chat/domain/viewportContract`.
 */

export function bindChannelMessageBuckets(
  messages: Ref<Record<string, RawMessage[]>>,
): void {
  messageWindowAuthority.bindMessages(messages);
}

export function ensureChannelBucket(channelId: string): RawMessage[] {
  return messageWindowAuthority.ensureChannelBucket(channelId);
}

export function syncChannelMessages(
  channelId: string,
  index: ChannelMessageIndex,
): RawMessage[] {
  return messageWindowAuthority.syncChannelMessages(channelId, index);
}

/** Alias: materialize `messages[channelId]` from the index after in-place index mutations. */
export const materializeChannelMessagesFromIndex = syncChannelMessages;

/**
 * Append rows from a REST/history page that are not already in the channel index.
 * Safe when another writer (realtime, prefetch, tail sync) already added newer rows.
 */
export function mergeMissingChannelMessagesFromHistory(
  channelId: string,
  raw: RawMessage[],
): RawMessage[] {
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  const missing = raw.filter((m) => {
    const id = m.id?.trim();
    return !!id && !index.byId.has(id);
  });
  if (missing.length === 0) {
    return syncChannelMessages(channelId, index);
  }
  index.mergeBatch(missing, 'append');
  return syncChannelMessages(channelId, index);
}

/**
 * Set channel history from a page. **Empty index only** — full replace. If the channel
 * already has rows, merges by id instead (Discord-style: no stale HTTP snapshot wins).
 */
export function replaceChannelMessagesFromHistory(
  channelId: string,
  raw: RawMessage[],
): RawMessage[] {
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  if (index.sorted.value.length === 0) {
    index.mergeBatch(raw, 'replace');
    return syncChannelMessages(channelId, index);
  }
  return mergeMissingChannelMessagesFromHistory(channelId, raw);
}

export function prependChannelMessagesFromHistory(
  channelId: string,
  older: RawMessage[],
): { mergedOlderCount: number; messages: RawMessage[] } {
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  const beforeCount = index.sorted.value.length;
  index.mergeBatch(older, 'prepend');
  const synced = syncChannelMessages(channelId, index);
  return { mergedOlderCount: synced.length - beforeCount, messages: synced };
}

export function appendChannelMessagesFromHistory(
  channelId: string,
  newer: RawMessage[],
): { mergedNewerCount: number; messages: RawMessage[] } {
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  const beforeCount = index.sorted.value.length;
  index.mergeBatch(newer, 'append');
  const synced = syncChannelMessages(channelId, index);
  return { mergedNewerCount: synced.length - beforeCount, messages: synced };
}

export function insertChannelMessageFromHistory(
  channelId: string,
  raw: RawMessage,
): { inserted: boolean; messages: RawMessage[] } {
  const list = ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  if (raw.id && index.byId.has(raw.id)) {
    return { inserted: false, messages: list };
  }
  index.insert(raw);
  return { inserted: true, messages: syncChannelMessages(channelId, index) };
}

export function updateChannelMessageInBucket(
  channelId: string,
  messageId: string,
  patch: Partial<RawMessage>,
): { updated: boolean; messages: RawMessage[] } {
  const list = ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  if (!index.byId.has(messageId)) {
    return { updated: false, messages: list };
  }
  index.update(messageId, patch);
  return { updated: true, messages: syncChannelMessages(channelId, index) };
}

function cloneMessageReactions(
  reactions: MessageReaction[] | undefined,
): MessageReaction[] | undefined {
  if (!reactions?.length) return undefined;
  return reactions.map((reaction) => ({
    ...reaction,
    userIds: [...reaction.userIds],
  }));
}

export function restoreChannelMessageReactions(
  channelId: string,
  messageId: string,
  previousReactions: MessageReaction[] | undefined,
): { updated: boolean; messages: RawMessage[] } {
  return updateChannelMessageInBucket(channelId, messageId, {
    reactions: cloneMessageReactions(previousReactions),
  });
}

export function hasChannelMessageInBucket(
  channelId: string,
  messageId: string,
): boolean {
  if (!messageId) return false;
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  return index.byId.has(messageId);
}

/** Removes one row from the channel index and materializes `messages[channelId]` (and the active window when applicable). */
export function removeChannelMessageFromBucket(
  channelId: string,
  messageId: string,
): boolean {
  if (!messageId) return false;
  ensureChannelBucket(channelId);
  const index = messageWindowAuthority.getIndex(channelId);
  if (!index.byId.has(messageId)) return false;
  index.remove(messageId);
  syncChannelMessages(channelId, index);
  return true;
}

export function applyEchoChannelClientCap(
  channelId: string,
  activeChannelId: string,
): { applied: boolean; refreshHasMoreOlderForActiveChannel: boolean } {
  return messageWindowAuthority.applyEchoChannelClientCap(
    channelId,
    activeChannelId,
  );
}

/** Drop index + bucket row for one channel (e.g. shell deleted channel). */
export function removeChannelMessageBucket(channelId: string): void {
  messageWindowAuthority.removeChannelBucket(channelId);
}

/** Dispose indexes and remove buckets for many channel ids (e.g. server deleted). */
export function removeChannelMessageBucketsForIds(channelIds: string[]): void {
  messageWindowAuthority.removeChannelBucketsForIds(channelIds);
}

/** Replace the entire messages record; disposes indexes for channels not present in `next`. */
export function replaceWorkspaceMessagesSnapshot(
  next: Record<string, RawMessage[]>,
): void {
  messageWindowAuthority.replaceWorkspaceMessagesSnapshot(next);
}

/** Dispose all channel indexes and clear the bound messages record (session reset). */
export function clearWorkspaceMessagesRecord(): void {
  messageWindowAuthority.clearWorkspaceMessagesRecord();
}

/**
 * Single discovery surface for supported channel message mutations (bind + all write paths).
 * Prefer importing individual functions; this object documents the full API.
 */
export const channelMessagesOwner = {
  bindChannelMessageBuckets,
  ensureChannelBucket,
  syncChannelMessages,
  materializeChannelMessagesFromIndex,
  replaceChannelMessagesFromHistory,
  mergeMissingChannelMessagesFromHistory,
  prependChannelMessagesFromHistory,
  insertChannelMessageFromHistory,
  updateChannelMessageInBucket,
  restoreChannelMessageReactions,
  hasChannelMessageInBucket,
  applyEchoChannelClientCap,
  removeChannelMessageBucket,
  removeChannelMessageBucketsForIds,
  replaceWorkspaceMessagesSnapshot,
  clearWorkspaceMessagesRecord,
} as const;
