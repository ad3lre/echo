import type pg from 'pg';
import { config } from '../../config';
import { isEchoS3UploadConfigured } from '../uploads/s3UploadPresign';
import { isDiscordHostedImportMediaUrl } from '../../domain/discord/discordCdnUrls';
import { kickDiscordImportMediaMirrorDrain } from './discordImportMediaMirrorScheduler';
import { enqueueUnqueuedEchoDiscordImportMediaMirrorJobs } from '../../domain/echoStore/messages/discordImportMediaMirrorQueue';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageStickerPayload,
} from '../../../../../contracts/types';
import type { EchoMessageRow } from '../../domain/echoMessagesDal';

export type DiscordImportMediaMirrorJobRow = {
  message_id: string;
  channel_id: string;
  actor_id: string;
  attempts: number;
};

export type DiscordImportMediaMirrorFailureClass = 'transient' | 'permanent';

/** Classify failures so invalid media does not consume CDN/storage retries. */
export function classifyDiscordImportMediaMirrorFailure(
  message: string,
): DiscordImportMediaMirrorFailureClass {
  const m = message.trim().toLowerCase();
  if (
    /http (400|401|403|404|410)\b|content-length exceeds cap|body exceeds cap|bad content type|could not map .*content type|destination denied|invalid .*media|unsupported .*media/.test(
      m,
    )
  ) {
    return 'permanent';
  }
  return 'transient';
}

export function discordImportMediaEchoStorageReady(): boolean {
  return !!(config.echoLocalUploadDir || isEchoS3UploadConfigured());
}

/**
 * Recover imported/synced messages that were persisted while mirroring was
 * unavailable, or whose queue row was lost during an earlier deployment.
 * The processor still performs the authoritative URL check before copying.
 */
export async function enqueueUnqueuedDiscordImportMediaMirrorJobs(
  pool: pg.Pool,
  limit: number,
): Promise<number> {
  const enqueued = await enqueueUnqueuedEchoDiscordImportMediaMirrorJobs(
    pool,
    limit,
    config.echoDiscordImportMediaMirrorMaxQueueDepth,
  );
  if (enqueued > 0) kickDiscordImportMediaMirrorDrain();
  return enqueued;
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
      // Lottie stickers stay on Discord's unsigned CDN; mirroring JSON is unsupported.
      if (!s || s.format === 'lottie') continue;
      if (typeof s.url === 'string' && isDiscordHostedImportMediaUrl(s.url))
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
): Promise<boolean> {
  const ins = await pool.query(
    `WITH admission_lock AS (
       SELECT pg_advisory_xact_lock(
         hashtext('echo_discord_import_media_mirror_queue_depth')
       ) AS locked
     ), queue_depth AS (
       SELECT COUNT(*)::int AS active_count
       FROM echo_discord_import_media_mirror_queue
       CROSS JOIN admission_lock
       WHERE status IN ('pending', 'processing')
     )
     INSERT INTO echo_discord_import_media_mirror_queue (message_id, channel_id, actor_id)
     SELECT $1, $2, $3
     FROM queue_depth
     WHERE active_count < $4
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [
      row.messageId,
      row.channelId,
      row.actorId,
      config.echoDiscordImportMediaMirrorMaxQueueDepth,
    ],
  );
  if (ins.rowCount && ins.rowCount > 0) {
    kickDiscordImportMediaMirrorDrain();
  }
  return Boolean(ins.rowCount && ins.rowCount > 0);
}

/** Queue background rehost when a persisted message still references Discord CDN media. */
export async function maybeEnqueueDiscordImportMediaMirror(
  pool: pg.Pool,
  row: {
    messageId: string;
    channelId: string;
    actorId: string;
    attachments?: MessageAttachmentPayload[];
    stickers?: MessageStickerPayload[];
    embeds?: Embed[];
    forwardedFrom?: ForwardedFrom;
  },
): Promise<void> {
  if (
    !importedDiscordMessageNeedsMediaMirror({
      ...(row.attachments?.length ? { attachments: row.attachments } : {}),
      ...(row.stickers?.length ? { stickers: row.stickers } : {}),
      ...(row.embeds?.length ? { embeds: row.embeds } : {}),
      ...(row.forwardedFrom ? { forwardedFrom: row.forwardedFrom } : {}),
    })
  ) {
    return;
  }
  await enqueueDiscordImportMediaMirrorJob(pool, {
    messageId: row.messageId,
    channelId: row.channelId,
    actorId: row.actorId,
  });
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
       WHERE attempts < 12
         AND (
           status = 'pending'
           OR (
             status = 'processing'
             AND updated_at < NOW() - INTERVAL '10 minutes'
           )
         )
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
  failureClass: DiscordImportMediaMirrorFailureClass = classifyDiscordImportMediaMirrorFailure(
    message,
  ),
): Promise<void> {
  await pool.query(
    `UPDATE echo_discord_import_media_mirror_queue
     SET status = 'failed', updated_at = NOW(), last_error = CONCAT('[', $3, '] ', $2)
     WHERE message_id = $1`,
    [messageId, message.slice(0, 2000), failureClass],
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
