import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { ECHO_CHANNEL_MESSAGE_PAGE_SIZE } from '@/constants/echoHistoryPageSize';
import { messageWindowAuthority } from '@/services/realtime/messageWindowAuthority';
import {
  applyEchoChannelClientCap as applyEchoChannelClientCapFromAuthority,
  prependChannelMessagesFromHistory,
  replaceChannelMessagesFromHistory,
} from '@/services/realtime/channelMessageAuthority';

/**
 * Single write path after REST history pages or cache seeds touch the channel bucket:
 * replace/prepend via channelMessageAuthority, then `hasMoreOlder` + client retention cap
 * (messageWindowAuthority). Realtime appends use the exported cap helper only.
 */
export function applyEchoHistoryChannelClientCap(
  channelId: string,
  activeChannelIdForCap: string,
): boolean {
  const r = applyEchoChannelClientCapFromAuthority(
    channelId,
    activeChannelIdForCap,
  );
  if (r.refreshHasMoreOlderForActiveChannel) {
    messageWindowAuthority.setHasMoreOlder(channelId, true);
  }
  return r.applied;
}

/** Session-cached messages for instant channel switch — same cap / hasMoreOlder rules as history load. */
export function applyEchoHistorySeedFromCachedMessages(
  channelId: string,
  cached: RawMessage[],
  activeChannelIdForCap: string,
): void {
  replaceChannelMessagesFromHistory(channelId, cached);
  if (!applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap)) {
    // Partial buckets (e.g. only messages received over the socket) are often
    // shorter than one history page; we must not set `hasMoreOlder` false or
    // scroll-up history never runs. `loadOlder` clears this after an empty API page.
    messageWindowAuthority.setHasMoreOlder(channelId, true);
  }
}

/** First page from API (initial load, jump prefetch empty bucket, workspace prefetch). */
export function applyEchoHistoryInitialPageFromApi(
  channelId: string,
  rawPage: RawMessage[],
  apiMessageCount: number,
  activeChannelIdForCap: string,
): RawMessage[] {
  const synced = replaceChannelMessagesFromHistory(channelId, rawPage);
  messageWindowAuthority.setHasMoreOlder(
    channelId,
    apiMessageCount >= ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
  );
  applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  return synced;
}

/** Older page from API (scroll prepend, jump prefetch). */
export function applyEchoHistoryOlderPageFromApi(
  channelId: string,
  rawOlder: RawMessage[],
  apiMessageCount: number,
  activeChannelIdForCap: string,
): { mergedOlderCount: number } {
  if (apiMessageCount === 0) {
    messageWindowAuthority.setHasMoreOlder(channelId, false);
    return { mergedOlderCount: 0 };
  }
  const { mergedOlderCount } = prependChannelMessagesFromHistory(
    channelId,
    rawOlder,
  );
  if (apiMessageCount < ECHO_CHANNEL_MESSAGE_PAGE_SIZE) {
    messageWindowAuthority.setHasMoreOlder(channelId, false);
  }
  applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  return { mergedOlderCount };
}
