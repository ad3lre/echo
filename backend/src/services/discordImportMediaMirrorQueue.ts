import type pg from 'pg';
import { config } from '../config';
import { isEchoS3UploadConfigured } from './s3UploadPresign';
import { isDiscordHostedImportMediaUrl } from '../domain/discordCdnUrls';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageStickerPayload,
} from '../../../shared/types';
import type { EchoMessageRow } from '../domain/echoMessagesDal';

export type DiscordImportMediaMirrorJobRow = {
  message_id: string;
  channel_id: string;
  actor_id: string;
  attempts: number;
};

function discordImportMediaEchoStorageReady(): boolean {
  return !!(config.echoLocalUploadDir || isEchoS3UploadConfigured());
}

function collectEmbedDiscordUrls(embeds: unknown, out: Set<string>): void {
  if (!Array.isArray(embeds)) return;
  for (const e of embeds) {
    if (!e || typeof e !== 'object') continue;
    const emb = e as Embed;
    const img = emb.image?.url;
    if (typeof img === 'string' && img.trim()) out.add(img.trim());
    const th = emb.thumbnail?.url;
    if (typeof th === 'string' && th.trim()) out.add(th.trim());
    const fi = emb.footer?.icon_url;
    if (typeof fi === 'string' && fi.trim()) out.add(fi.trim());
    const ai = emb.author?.icon_url;
    if (typeof ai === 'string' && ai.trim()) out.add(ai.trim());
  }
}

/**
 * Returns true when the row still references at least one Discord CDN URL we mirror.
 */
export function echoMessageRowNeedsDiscordMediaMirror(
  row: EchoMessageRow,
): boolean {
  for (const u of [row.imageUrl, row.videoUrl, row.audioUrl]) {
    if (typeof u === 'string' && isDiscordHostedImportMediaUrl(u)) return true;
  }
  const att = row.attachments;
  if (Array.isArray(att)) {
    for (const a of att) {
      if (
        a &&
        typeof a.url === 'string' &&
        isDiscordHostedImportMediaUrl(a.url)
      )
        return true;
    }
  }
  const st = row.stickers;
  if (Array.isArray(st)) {
    for (const s of st) {
      if (
        s &&
        typeof s.url === 'string' &&
        isDiscordHostedImportMediaUrl(s.url)
      )
        return true;
    }
  }
  const embedUrls = new Set<string>();
  collectEmbedDiscordUrls(row.embeds, embedUrls);
  for (const u of embedUrls) {
    if (isDiscordHostedImportMediaUrl(u)) return true;
  }
  const fwd = row.forwardedFrom;
  if (fwd?.authorAvatar && isDiscordHostedImportMediaUrl(fwd.authorAvatar)) {
    return true;
  }
  const rt = row.replyTo;
  if (rt && typeof rt === 'object') {
    const av = (rt as { authorAvatar?: unknown }).authorAvatar;
    if (typeof av === 'string' && isDiscordHostedImportMediaUrl(av))
      return true;
  }
  return false;
}

/** Snapshot from the import loop before persistence (same shapes as stored message). */
export function importedDiscordMessageNeedsMediaMirror(payload: {
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  embeds?: Embed[];
  forwardedFrom?: ForwardedFrom;
}): boolean {
  const fake: EchoMessageRow = {
    id: '',
    channelId: '',
    authorId: '',
    content: '',
    timestamp: '',
    ...(payload.attachments?.length
      ? { attachments: payload.attachments }
      : {}),
    ...(payload.stickers?.length ? { stickers: payload.stickers } : {}),
    ...(payload.embeds?.length ? { embeds: payload.embeds } : {}),
    ...(payload.forwardedFrom ? { forwardedFrom: payload.forwardedFrom } : {}),
  };
  return echoMessageRowNeedsDiscordMediaMirror(fake);
}

export async function enqueueDiscordImportMediaMirrorJob(
  pool: pg.Pool,
  row: { messageId: string; channelId: string; actorId: string },
): Promise<void> {
  if (!discordImportMediaEchoStorageReady()) return;
  await pool.query(
    `INSERT INTO echo_discord_import_media_mirror_queue (message_id, channel_id, actor_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id) DO NOTHING`,
    [row.messageId, row.channelId, row.actorId],
  );
}

export async function claimNextDiscordImportMediaMirrorJob(
  pool: pg.Pool,
): Promise<DiscordImportMediaMirrorJobRow | null> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const sel = await c.query(
      `SELECT message_id, channel_id, actor_id, attempts
       FROM echo_discord_import_media_mirror_queue
       WHERE status = 'pending' AND attempts < 12
       ORDER BY message_id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    if (sel.rows.length === 0) {
      await c.query('COMMIT');
      return null;
    }
    const raw = sel.rows[0] as DiscordImportMediaMirrorJobRow;
    await c.query(
      `UPDATE echo_discord_import_media_mirror_queue
       SET status = 'processing',
           attempts = attempts + 1,
           updated_at = NOW(),
           last_error = NULL
       WHERE message_id = $1`,
      [raw.message_id],
    );
    await c.query('COMMIT');
    const attemptsAfter = Number(raw.attempts) + 1;
    return {
      message_id: raw.message_id,
      channel_id: raw.channel_id,
      actor_id: raw.actor_id,
      attempts: Number.isFinite(attemptsAfter) ? attemptsAfter : 1,
    };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function markDiscordImportMediaMirrorDone(
  pool: pg.Pool,
  messageId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_discord_import_media_mirror_queue
     SET status = 'done', updated_at = NOW(), last_error = NULL
     WHERE message_id = $1`,
    [messageId],
  );
}

export async function markDiscordImportMediaMirrorFailed(
  pool: pg.Pool,
  messageId: string,
  message: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_discord_import_media_mirror_queue
     SET status = 'failed', updated_at = NOW(), last_error = $2
     WHERE message_id = $1`,
    [messageId, message.slice(0, 2000)],
  );
}

export async function requeueDiscordImportMediaMirrorPending(
  pool: pg.Pool,
  messageId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_discord_import_media_mirror_queue
     SET status = 'pending', updated_at = NOW()
     WHERE message_id = $1`,
    [messageId],
  );
}
