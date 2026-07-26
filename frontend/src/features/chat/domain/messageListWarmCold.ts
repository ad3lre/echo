import type { MessageListViewportSnapshot } from '@/features/chat/composables/messageListViewportStorage';

/**
 * Warm/cold channel-open contract for MessageList.
 *
 * Warm means the target window can render immediately at the intended initial
 * position without waiting for network data. Having a few stale messages, an
 * incomplete window, or messages without the intended mid-history anchor is
 * **not** warm.
 *
 * Decide once at transition start (stamp channel id). Do not reclassify the same
 * transition from reactive chrome flags.
 */

export type MessageListWarmColdInput = {
  /** Channel being opened. */
  channelId: string | null | undefined;
  /**
   * Channel id that owns the current ordered message set. Must match `channelId` or
   * the decision is cold (prevents old-channel bleed during store transitions).
   */
  windowChannelId: string | null | undefined;
  /** Ordered ids currently in the set for `windowChannelId`. */
  orderedIds: readonly string[];
  /** Session viewport memory for `channelId`, if any. */
  savedViewport: MessageListViewportSnapshot | null;
};

export type MessageListWarmColdDecision = {
  channelId: string;
  warm: boolean;
  reason:
    | 'no_channel'
    | 'window_channel_mismatch'
    | 'empty_window'
    | 'mid_history_anchor_missing'
    | 'warm_follow_tail'
    | 'warm_anchor_in_window';
};

export function decideMessageListChannelWarm(
  input: MessageListWarmColdInput,
): MessageListWarmColdDecision {
  const channelId = input.channelId?.trim() ?? '';
  if (!channelId) {
    return { channelId: '', warm: false, reason: 'no_channel' };
  }

  const windowChannelId = input.windowChannelId?.trim() ?? '';
  if (!windowChannelId || windowChannelId !== channelId) {
    return { channelId, warm: false, reason: 'window_channel_mismatch' };
  }

  if (input.orderedIds.length === 0) {
    return { channelId, warm: false, reason: 'empty_window' };
  }

  const saved = input.savedViewport;
  if (saved && !saved.followNewMessages) {
    const anchor = saved.anchorMessageId?.trim() ?? '';
    if (!anchor || !input.orderedIds.includes(anchor)) {
      return { channelId, warm: false, reason: 'mid_history_anchor_missing' };
    }
    return { channelId, warm: true, reason: 'warm_anchor_in_window' };
  }

  return { channelId, warm: true, reason: 'warm_follow_tail' };
}
