import type { EchoMentionNotificationRow } from '@shared/types';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import { messageContentPreviewPlainText } from '@/features/chat/domain/messagePreviewPlain';
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
 *
 * Client stubs (preview === MENTION_NOTIFICATION_STUB_PREVIEW) are dropped for
 * any channel the server already covers. The attention snapshot uses
 * `latestUnreadMessageId` as the stub anchor, which is the most recent unread
 * message regardless of whether it carries an @mention. When subsequent
 * non-mention messages arrive after the @mention, that anchor differs from the
 * server's mention row ID, producing a phantom stub that can never match a
 * server row. Dropping stubs for server-covered channels eliminates these
 * phantom loading indicators.
 */
export function mergeMentionNotificationRows(
  serverRows: readonly DmMentionNotificationRow[],
  clientRows: readonly DmMentionNotificationRow[],
  maxItems = 200,
): DmMentionNotificationRow[] {
  const byKey = new Map<string, DmMentionNotificationRow>();

  // Track which channels the server has already provided mention rows for.
  const serverChannelIds = new Set<string>();
  for (const row of serverRows) {
    byKey.set(row.key, row);
    const cid = row.channelId.trim();
    if (cid) serverChannelIds.add(cid);
  }

  const clientResolvedChannelIds = new Set<string>();
  for (const row of clientRows) {
    if (isPlaceholderPreview(row.preview)) continue;
    const cid = row.channelId.trim();
    if (cid) clientResolvedChannelIds.add(cid);
  }

  for (const row of clientRows) {
    const existing = byKey.get(row.key);

    // Drop client stubs for channels the server already covers. The stub's
    // messageId is `latestUnreadMessageId` (newest unread, not necessarily the
    // @mention itself), so it often mismatches the server row's messageId.
    // Real client rows (live socket messages with resolved previews) are always
    // kept — they represent mentions that arrived after the last server fetch.
    const channelId = row.channelId.trim();
    if (
      !existing &&
      isPlaceholderPreview(row.preview) &&
      (serverChannelIds.has(channelId) ||
        clientResolvedChannelIds.has(channelId))
    ) {
      continue;
    }

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
