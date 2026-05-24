import type { MentionEntity, MentionKind } from '@shared/types';
import { messageRepliesToUser } from '@shared/attentionPing';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { messagePreviewPlainText } from '@/services/domain/messagePreviewPlain';

export type DmMentionNotificationRow = {
  key: string;
  channelId: string;
  channelLabel: string;
  messageId: string;
  authorId: string;
  authorName: string;
  preview: string;
  timestamp: string;
  mentionKinds: MentionKind[];
};

function mentionPingsSelf(m: MentionEntity, selfId: string): boolean {
  if (m.kind === 'user') return (m.userId ?? m.id) === selfId;
  if (m.kind === 'everyone' || m.kind === 'active') return true;
  return false;
}

function messagePingsSelf(msg: RawMessage, selfId: string): boolean {
  if (messageRepliesToUser(msg.replyTo, msg.replyTo?.authorId, selfId)) {
    return true;
  }
  const list = msg.mentions;
  if (!list?.length) return false;
  return list.some((x) => mentionPingsSelf(x, selfId));
}

/**
 * Best-effort inbox of @-style pings from the local message cache (guild + DM channels).
 * Server search / history pagination is out of scope.
 */
export function collectDmMentionNotifications(input: {
  messagesByChannelId: Record<string, readonly RawMessage[] | undefined>;
  selfUserId: string;
  resolveChannelLabel: (channelId: string) => string;
  resolveUserName: (userId: string) => string;
  maxItems?: number;
}): DmMentionNotificationRow[] {
  const selfId = input.selfUserId.trim();
  if (!selfId) return [];

  const max = Math.min(Math.max(input.maxItems ?? 80, 1), 500);
  const rows: DmMentionNotificationRow[] = [];
  const seen = new Set<string>();

  for (const [channelId, list] of Object.entries(input.messagesByChannelId)) {
    if (!list?.length) continue;
    const ch = channelId.trim();
    if (!ch) continue;

    for (const msg of list) {
      if (!messagePingsSelf(msg, selfId)) continue;
      // Hide self-pings: do not list notifications for messages you authored.
      if ((msg.authorId ?? '').trim() === selfId) continue;
      const mid = msg.id?.trim();
      if (!mid) continue;
      const dedupe = `${ch}:${mid}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const kinds = (msg.mentions ?? [])
        .filter((m) => mentionPingsSelf(m, selfId))
        .map((m) => m.kind);
      const uniqKinds = [...new Set(kinds)];
      if (
        uniqKinds.length === 0 &&
        messageRepliesToUser(msg.replyTo, msg.replyTo?.authorId, selfId)
      ) {
        uniqKinds.push('user');
      }

      rows.push({
        key: dedupe,
        channelId: ch,
        channelLabel: input.resolveChannelLabel(ch),
        messageId: mid,
        authorId: msg.authorId,
        authorName: input.resolveUserName(msg.authorId),
        preview: messagePreviewPlainText(msg, 220) || '…',
        timestamp: msg.timestamp,
        mentionKinds: uniqKinds,
      });
    }
  }

  rows.sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (na !== nb) return nb - na;
    return b.messageId.localeCompare(a.messageId);
  });

  return rows.slice(0, max);
}
