import type { EchoMentionNotificationRow } from '@shared/types';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import { messageContentPreviewPlainText } from '@/services/domain/messagePreviewPlain';
import {
  MENTION_NOTIFICATION_FAILED_PREVIEW,
  MENTION_NOTIFICATION_STUB_PREVIEW,
} from '@/features/dm/mentionNotificationAuthority';

/** A preview that still needs hydration (loading stub or load failure). */
function isPlaceholderPreview(preview: string): boolean {
  return (
    preview === MENTION_NOTIFICATION_STUB_PREVIEW ||
    preview === MENTION_NOTIFICATION_FAILED_PREVIEW
  );
}

/**
 * Map server-authoritative mention rows into the client's row shape. The server
 * already hydrated the body + author, so previews resolve immediately (no
 * "Loading mention…" stub). Channel labels / nicknames are still resolved on
 * the client downstream, so a sensible fallback is used here.
 */
export function mapServerMentionRowsToDmRows(
  rows: readonly EchoMentionNotificationRow[],
): DmMentionNotificationRow[] {
  return rows.map((row) => ({
    key: row.key || `${row.channelId}:${row.messageId}`,
    channelId: row.channelId,
    channelLabel: '',
    messageId: row.messageId,
    authorId: row.authorId,
    authorName: row.authorName || 'Someone',
    preview: messageContentPreviewPlainText(row.content, 220) || '…',
    timestamp: row.timestamp,
    mentionKinds: [...row.mentionKinds],
  }));
}

function rowTimeValue(row: DmMentionNotificationRow): number {
  const t = Date.parse(row.timestamp);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Union of the server feed and the locally reconstructed rows, keyed by
 * `channelId:messageId`. The server feed is authoritative for bodies; local
 * rows fill in anything the feed hasn't returned yet (live socket messages
 * since the last fetch). When both exist, prefer whichever has a real preview.
 */
export function mergeMentionNotificationRows(
  serverRows: readonly DmMentionNotificationRow[],
  clientRows: readonly DmMentionNotificationRow[],
  maxItems = 200,
): DmMentionNotificationRow[] {
  const byKey = new Map<string, DmMentionNotificationRow>();

  for (const row of serverRows) {
    byKey.set(row.key, row);
  }

  for (const row of clientRows) {
    const existing = byKey.get(row.key);
    if (!existing) {
      byKey.set(row.key, row);
      continue;
    }
    // Server row exists. Only let the client row win when the server preview is
    // a placeholder while the client has real content.
    if (
      isPlaceholderPreview(existing.preview) &&
      !isPlaceholderPreview(row.preview)
    ) {
      byKey.set(row.key, row);
    }
  }

  return [...byKey.values()]
    .sort((a, b) => {
      const ta = rowTimeValue(a);
      const tb = rowTimeValue(b);
      if (ta !== tb) return tb - ta;
      return b.messageId.localeCompare(a.messageId);
    })
    .slice(0, Math.max(1, maxItems));
}
