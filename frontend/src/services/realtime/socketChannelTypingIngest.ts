/** Payload shape for `channel:typing` (or equivalent) socket events. */
export type RemoteChannelTypingPayload = {
  channelId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
};

/** Whether the typing indicator should update local state (non-empty ids, not self). */
export function shouldApplyRemoteChannelTyping(
  payload: RemoteChannelTypingPayload | null | undefined,
  currentUserId: string | undefined,
): payload is RemoteChannelTypingPayload {
  if (!payload?.channelId || !payload.userId) return false;
  const self = currentUserId?.trim();
  if (self && payload.userId === self) return false;
  return true;
}
