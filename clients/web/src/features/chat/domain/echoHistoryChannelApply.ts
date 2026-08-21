import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { ECHO_CHANNEL_MESSAGE_PAGE_SIZE } from '@/features/chat/echoHistoryPageSize';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import {
  applyEchoChannelClientCap as applyEchoChannelClientCapFromAuthority,
  appendChannelMessagesFromHistory,
  ensureChannelBucket,
  prependChannelMessagesFromHistory,
  replaceChannelMessagesFromHistory,
} from '@/features/chat/domain/channelMessageAuthority';

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

/**
 * Channel switch with messages already in memory — refresh the active window and caps
 * without replacing history (replace would risk dropping rows newer than the bucket copy).
 */
export function applyEchoHistorySeedFromCachedMessages(
  channelId: string,
  _cached: RawMessage[],
  activeChannelIdForCap: string,
): void {
  ensureChannelBucket(channelId);
  messageWindowAuthority.getIndex(channelId);
  messageWindowAuthority.refreshActiveWindow();
  if (!applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap)) {
    // Partial buckets (e.g. only messages received over the socket) are often
    // shorter than one history page; we must not set `hasMoreOlder` false or
    // scroll-up history never runs. `loadOlder` clears this after an empty API page.
    messageWindowAuthority.setHasMoreOlder(channelId, true);
  }
}

/**
 * First page from API (initial load, jump prefetch empty bucket, workspace prefetch).
 * `pageLimit` is the size actually requested — `hasMoreOlder` must compare against
 * it, not a fixed constant, so a smaller initial page does not wrongly disable
 * scroll-up history. Defaults to the full page size for back-compat.
 */
export function applyEchoHistoryInitialPageFromApi(
  channelId: string,
  rawPage: RawMessage[],
  apiMessageCount: number,
  activeChannelIdForCap: string,
  pageLimit: number = ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
): RawMessage[] {
  const synced = replaceChannelMessagesFromHistory(channelId, rawPage);
  messageWindowAuthority.setHasMoreOlder(
    channelId,
    apiMessageCount >= pageLimit,
  );
  // A latest-position page is already at the newest known edge.
  messageWindowAuthority.setHasMoreNewer(channelId, false);
  applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  if (
    apiMessageCount < pageLimit &&
    messageWindowAuthority.hasCachedOlder(channelId)
  ) {
    messageWindowAuthority.setBoundary(channelId, 'older', 'more');
  }
  return synced;
}

/** Newer rows from API tail sync (socket reconnect / tab resume / cache hit). */
export function applyEchoHistoryLatestPageFromApi(
  channelId: string,
  rawNewer: RawMessage[],
  activeChannelIdForCap: string,
): { mergedNewerCount: number } {
  if (rawNewer.length === 0) {
    messageWindowAuthority.setHasMoreNewer(channelId, false);
    return { mergedNewerCount: 0 };
  }
  const { mergedNewerCount } = appendChannelMessagesFromHistory(
    channelId,
    rawNewer,
  );
  if (mergedNewerCount > 0) {
    applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  }
  messageWindowAuthority.setHasMoreNewer(channelId, false);
  return { mergedNewerCount };
}

/** Newer rows fetched while the user is viewing an older retained page. */
export function applyEchoHistoryNewerPageFromApi(
  channelId: string,
  rawNewer: RawMessage[],
  apiMessageCount: number,
  activeChannelIdForCap: string,
  pageLimit: number = ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
): { mergedNewerCount: number } {
  const { mergedNewerCount } = appendChannelMessagesFromHistory(
    channelId,
    rawNewer,
  );
  messageWindowAuthority.setHasMoreNewer(
    channelId,
    apiMessageCount >= pageLimit,
  );
  if (mergedNewerCount > 0) {
    applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  }
  return { mergedNewerCount };
}

/** Target-centered page; both directional edges remain fetchable until proven otherwise. */
export function applyEchoHistoryAroundPageFromApi(
  channelId: string,
  rawAround: RawMessage[],
  activeChannelIdForCap: string,
): { mergedCount: number } {
  const synced = replaceChannelMessagesFromHistory(channelId, rawAround);
  messageWindowAuthority.setBoundary(channelId, 'older', 'more');
  messageWindowAuthority.setBoundary(channelId, 'newer', 'more');
  applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  return { mergedCount: synced.length };
}

/** Older page from API (scroll prepend, jump prefetch). */
export function applyEchoHistoryOlderPageFromApi(
  channelId: string,
  rawOlder: RawMessage[],
  apiMessageCount: number,
  activeChannelIdForCap: string,
  pageLimit: number = ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
): { mergedOlderCount: number } {
  if (apiMessageCount === 0) {
    messageWindowAuthority.setBoundary(
      channelId,
      'older',
      messageWindowAuthority.hasCachedOlder(channelId) ? 'more' : 'reached',
    );
    return { mergedOlderCount: 0 };
  }
  const { mergedOlderCount } = prependChannelMessagesFromHistory(
    channelId,
    rawOlder,
  );
  if (apiMessageCount < pageLimit) {
    messageWindowAuthority.setBoundary(
      channelId,
      'older',
      messageWindowAuthority.hasCachedOlder(channelId) ? 'more' : 'reached',
    );
  }
  applyEchoHistoryChannelClientCap(channelId, activeChannelIdForCap);
  return { mergedOlderCount };
}
