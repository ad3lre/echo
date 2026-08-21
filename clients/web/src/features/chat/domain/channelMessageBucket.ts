import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  getChannelIndex,
  type ChannelMessageIndex,
} from '@/features/chat/domain/channelMessageIndex';
import { resolveEchoChannelMessagesClientCap } from '@/features/layout/echoWorkspace/echoChannelMessageWindow';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';

/** Writes the index’s sorted slice into the shared per-channel message bucket. */
export function writeSortedMessagesForChannel(
  messagesRecord: Record<string, RawMessage[]>,
  channelId: string,
  index: ChannelMessageIndex,
): RawMessage[] {
  const sorted = index.sorted.value as RawMessage[];
  messagesRecord[channelId] = sorted;
  return sorted;
}

export type ApplyEchoChannelClientCapOptions = {
  activeChannelId: string;
  /**
   * Override max rows. When omitted, active channel uses a high cap; other channels a lower one
   * ({@link resolveEchoChannelMessagesClientCap}).
   */
  cap?: number;
};

/**
 * Trims **oldest** rows via `messageIndex` so the channel stays within the client cap —
 * prefer keeping **nearby** loaded history; surface gaps with `hasMoreOlder` / refetch, not
 * ad-hoc reloads (`@/features/chat/domain/viewportContract`).
 *
 * When trimming occurs for the active channel, callers should set `hasMoreOlder` so
 * scroll-up can refetch dropped history.
 */
export function applyEchoChannelClientCapToBucket(
  messagesRecord: Record<string, RawMessage[]>,
  channelId: string,
  options: ApplyEchoChannelClientCapOptions,
): {
  applied: boolean;
  refreshHasMoreOlderForActiveChannel: boolean;
  evictedHead: RawMessage[];
} {
  const list = messagesRecord[channelId];
  if (!list?.length || !isEchoGraphId(channelId)) {
    return {
      applied: false,
      refreshHasMoreOlderForActiveChannel: false,
      evictedHead: [],
    };
  }
  const cap =
    options.cap ??
    resolveEchoChannelMessagesClientCap(channelId, options.activeChannelId);
  const index = getChannelIndex(channelId, list);
  const removeCount = index.sorted.value.length - cap;
  const evictedHead =
    removeCount > 0 ? [...index.sorted.value].slice(0, removeCount) : [];
  if (!index.trimHead(removeCount)) {
    return {
      applied: false,
      refreshHasMoreOlderForActiveChannel: false,
      evictedHead: [],
    };
  }
  writeSortedMessagesForChannel(messagesRecord, channelId, index);
  return {
    applied: true,
    refreshHasMoreOlderForActiveChannel: channelId === options.activeChannelId,
    evictedHead,
  };
}
