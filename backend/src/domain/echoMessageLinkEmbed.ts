/**
 * Resolves pasted in-app message URLs (`/channels/:channelId/:messageId`) into rich link embeds
 * for chat (author + channel + snippet). Validates channel_id ↔ message_id against the DB.
 */

import type pg from 'pg';
import type { Embed } from '../../../shared/types';
import { canUserAccessChannel, getEchoMessageById } from './echoStore';

export function parseEchoMessageJumpPath(
  urlString: string,
): { channelId: string; messageId: string } | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const m = u.pathname.match(/^\/channels\/([^/]+)\/([^/?#]+)\/?$/);
  if (!m) return null;
  const channelId = m[1];
  const messageId = m[2];
  if (!channelId?.trim() || !messageId?.trim()) return null;
  return { channelId, messageId };
}

function truncatePlain(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * When the pathname matches `/channels/:a/:b`, treat as a message jump link only if
 * a message with id `b` exists and belongs to channel `a`.
 */
export async function buildEchoJumpEmbedFromUrl(
  pool: pg.Pool,
  viewerUserId: string,
  originalUrl: string,
): Promise<Embed | null> {
  const parsed = parseEchoMessageJumpPath(originalUrl);
  if (!parsed) return null;

  const msg = await getEchoMessageById(pool, parsed.messageId);
  if (!msg || msg.channelId !== parsed.channelId) return null;

  const ok = await canUserAccessChannel(pool, viewerUserId, msg.channelId);
  if (!ok) return null;

  const [chRow, authorRow] = await Promise.all([
    pool.query<{ name: string }>(
      `SELECT name FROM echo_channels WHERE id = $1 LIMIT 1`,
      [msg.channelId],
    ),
    pool.query<{ n: string }>(
      `
      SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(username), ''), 'Unknown') AS n
      FROM auth_users WHERE id = $1 LIMIT 1
      `,
      [msg.authorId],
    ),
  ]);

  const channelName = chRow.rows[0]?.name?.trim() || 'channel';
  const authorName = authorRow.rows[0]?.n?.trim() || 'Unknown';
  const desc = msg.content?.trim() ? truncatePlain(msg.content, 200) : '—';

  const embed: Embed = {
    url: originalUrl,
    provider: 'Echo',
    title: `#${channelName}`,
    description: desc,
    author: { name: authorName },
    timestamp: msg.timestamp,
    color: 0x5865f2,
    echoJump: { channelId: msg.channelId, messageId: msg.id },
  };
  return embed;
}
