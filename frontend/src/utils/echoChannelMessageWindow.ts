import type { RawMessage } from '@/features/chat/chatMessageTypes';

/**
 * Max messages kept for the **active** channel (the one open in the UI).
 * Prefer a large cap: fewer trims, refetches, and index churn — trade RAM for stability.
 */
export const ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE = 6000;

/**
 * Max messages for **other** channels still held in the workspace record.
 * High enough that quick channel switches keep a warm slice without re-hit the network.
 */
export const ECHO_CHANNEL_MESSAGES_CLIENT_CAP_BACKGROUND = 2400;

/**
 * Back-compat alias: same as {@link ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE}.
 * @deprecated Prefer ACTIVE / BACKGROUND or {@link resolveEchoChannelMessagesClientCap}.
 */
export const ECHO_CHANNEL_MESSAGES_CLIENT_CAP =
  ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE;

/**
 * Effective cap for a channel given which conversation is focused (no viewport measurement).
 */
export function resolveEchoChannelMessagesClientCap(
  channelId: string,
  activeChannelId: string,
): number {
  const a = activeChannelId.trim();
  return channelId === a
    ? ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE
    : ECHO_CHANNEL_MESSAGES_CLIENT_CAP_BACKGROUND;
}

/**
 * Drop oldest messages in place so length ≤ cap; keeps the newest window (end of array).
 * @returns true if anything was removed
 */
export function trimEchoChannelMessagesFromHead(
  list: RawMessage[] | undefined,
  cap = ECHO_CHANNEL_MESSAGES_CLIENT_CAP_ACTIVE,
): boolean {
  if (!list || list.length <= cap) return false;
  const remove = list.length - cap;
  list.splice(0, remove);
  return true;
}
