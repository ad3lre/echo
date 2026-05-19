/**
 * Tracks optimistic outbound chat messages by client-generated id so inbound
 * `message` events can recover the real author id before the server echoes.
 */

export type PendingClientEchoMessage = {
  channelId: string;
  clientMessageId: string;
  authorId: string;
  replyToId?: string;
  createdAtMs: number;
};

export const PENDING_CLIENT_MESSAGE_MAX_AGE_MS = 15_000;

export function prunePendingClientMessages(
  list: PendingClientEchoMessage[],
  nowMs: number,
  maxAgeMs: number = PENDING_CLIENT_MESSAGE_MAX_AGE_MS,
): void {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (nowMs - list[i]!.createdAtMs > maxAgeMs) {
      list.splice(i, 1);
    }
  }
}

export function recordPendingClientMessage(
  list: PendingClientEchoMessage[],
  row: {
    channelId: string;
    clientMessageId: string;
    authorId: string;
    replyToId?: string;
  },
  nowMs: number,
): void {
  prunePendingClientMessages(list, nowMs);
  list.push({
    ...row,
    createdAtMs: nowMs,
  });
}

/** Match pending optimistic send; return stored author or fallback. */
export function consumeAuthorForPendingClientMessage(
  list: PendingClientEchoMessage[],
  channelId: string,
  clientMessageId: string,
  fallbackAuthorId: string,
  nowMs: number,
): string {
  prunePendingClientMessages(list, nowMs);
  const matchIdx = list.findIndex(
    (entry) =>
      entry.channelId === channelId &&
      entry.clientMessageId === clientMessageId,
  );
  if (matchIdx < 0) return fallbackAuthorId;
  const matched = list.splice(matchIdx, 1)[0];
  return matched?.authorId ?? fallbackAuthorId;
}

export function dropPendingClientMessageByClientId(
  list: PendingClientEchoMessage[],
  clientMessageId: string,
): void {
  const idx = list.findIndex((p) => p.clientMessageId === clientMessageId);
  if (idx >= 0) list.splice(idx, 1);
}

export function dropPendingClientMessageIfChannelAndId(
  list: PendingClientEchoMessage[],
  channelId: string,
  clientMessageId: string,
): void {
  const pidx = list.findIndex(
    (p) => p.clientMessageId === clientMessageId && p.channelId === channelId,
  );
  if (pidx >= 0) list.splice(pidx, 1);
}

/** True while this id is still an optimistic outbound send (not yet acked / persisted). */
export function isPendingClientMessageId(
  list: PendingClientEchoMessage[],
  channelId: string,
  messageId: string,
  nowMs: number,
): boolean {
  prunePendingClientMessages(list, nowMs);
  const mid = messageId.trim();
  if (!mid) return false;
  return list.some(
    (e) => e.channelId === channelId && e.clientMessageId === mid,
  );
}
