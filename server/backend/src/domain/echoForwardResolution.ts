import type pg from 'pg';
import type { ForwardedFrom } from '../../../../contracts/types';
import { diagnoseEchoChannelAccess } from './echoStore/members/access';
import { getEchoMessageById } from './echoMessagesDal';

const PREVIEW_MAX = 500;

export async function resolveEchoForwardSnapshot(
  pool: pg.Pool,
  userId: string,
  forwardMessageId: string,
): Promise<
  { ok: true; forwardedFrom: ForwardedFrom } | { ok: false; error: string }
> {
  const mid = forwardMessageId.trim();
  if (!mid) return { ok: false, error: 'forwardMessageId required' };

  const row = await getEchoMessageById(pool, mid);
  if (!row) {
    return { ok: false, error: 'Original message not found' };
  }

  const access = await diagnoseEchoChannelAccess(pool, userId, row.channelId);
  if (!access.ok) {
    return {
      ok: false,
      error: 'You cannot forward a message you cannot view',
    };
  }

  const plain = (row.searchIndexText ?? row.content ?? '').trim();
  const preview =
    plain.length > PREVIEW_MAX ? `${plain.slice(0, PREVIEW_MAX - 1)}…` : plain;

  const name = row.authorDisplayName?.trim() || 'Unknown';
  const forwardedFrom: ForwardedFrom = {
    messageId: row.id,
    channelId: row.channelId,
    authorName: name,
    ...(row.authorAvatar?.trim()
      ? { authorAvatar: row.authorAvatar.trim() }
      : {}),
    contentPreview: preview || '(no text)',
  };
  return { ok: true, forwardedFrom };
}
