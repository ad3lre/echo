/**
 * Re-fetch Discord message media from the export bot and requeue Echo rehost
 * when mirrored objects are missing/corrupt (or CDN URLs are stale).
 */
import type pg from 'pg';
import { DISCORD_BOT_INTERNAL_FETCH_MS } from '../../constants/outboundHttp';
import { config } from '../../config';
import { isDiscordHostedImportMediaUrl } from '../../domain/discord/discordCdnUrls';
import {
  getEchoMessageById,
  updateEchoMessageDiscordImportMirroredMedia,
  type EchoMessageRow,
} from '../../domain/echoMessagesDal';
import { extractEchoStorageKeyFromPublicUrl } from '../uploads/echoUploadPublicUrl';
import { echoUploadObjectExists } from '../uploads/echoUploadObjectVerify';
import {
  parseImportedAttachments,
  parseImportedEmbeds,
  parseImportedStickers,
} from './discordMessageImport';
import { listEchoMessagesWithDiscordImportMediaTokens } from '../../domain/echoStore/messages/discordImportMediaRepairQueries';
import {
  echoMessageRowNeedsDiscordMediaMirror,
  forceEnqueueDiscordImportMediaMirrorJob,
} from './discordImportMediaMirrorQueue';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageStickerPayload,
  ReplyTo,
} from '../../../../../contracts/types';

export type BotFetchedMessage = {
  id?: unknown;
  attachments?: unknown;
  stickers?: unknown;
  embeds?: unknown;
  forwardedFrom?: unknown;
};

export async function resolveDiscordChannelIdForEchoChannel(
  pool: pg.Pool,
  echoChannelId: string,
): Promise<string | null> {
  const source = await pool.query<{ discord_channel_id: string }>(
    `SELECT discord_channel_id
     FROM echo_discord_channel_message_imports
     WHERE channel_id = $1
     UNION ALL
     SELECT discord_channel_id
     FROM echo_discord_channel_bridges
     WHERE channel_id = $1
       AND (inbound_enabled = true OR outbound_enabled = true)
     LIMIT 1`,
    [echoChannelId],
  );
  const id = source.rows[0]?.discord_channel_id?.trim();
  return id || null;
}

/** Fetch one Discord message via the bot internal API. */
export async function fetchDiscordMessageFromBot(
  discordChannelId: string,
  discordMessageId: string,
): Promise<BotFetchedMessage | null> {
  const botPort = process.env.ECHO_DISCORD_BOT_INTERNAL_PORT || '3005';
  const botUrl = `http://localhost:${botPort}/channels/${discordChannelId}/messages/${discordMessageId}`;
  const response = await fetch(botUrl, {
    signal: AbortSignal.timeout(DISCORD_BOT_INTERNAL_FETCH_MS),
    headers: {
      'x-echo-discord-bot-secret': config.echoDiscordBotWebhookSecret,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    const errMsg =
      typeof body.error === 'string' ? body.error : response.statusText;
    throw new Error(`Bot message fetch failed: ${errMsg}`);
  }
  const body = (await response.json()) as { message?: BotFetchedMessage };
  return body.message && typeof body.message === 'object' ? body.message : null;
}

function isEchoMirroredDiscordImportUrl(url: string): boolean {
  const key = extractEchoStorageKeyFromPublicUrl(url);
  return typeof key === 'string' && key.includes('discord-import-media-');
}

/** Collect Echo storage keys for discord-import-media objects referenced by the row. */
export function collectEchoMirroredDiscordImportStorageKeys(
  row: EchoMessageRow,
): string[] {
  const keys = new Set<string>();
  const consider = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    if (!isEchoMirroredDiscordImportUrl(raw)) return;
    const key = extractEchoStorageKeyFromPublicUrl(raw);
    if (key) keys.add(key);
  };
  consider(row.imageUrl);
  consider(row.videoUrl);
  consider(row.audioUrl);
  if (Array.isArray(row.attachments)) {
    for (const a of row.attachments) consider(a?.url);
  }
  if (Array.isArray(row.stickers)) {
    for (const s of row.stickers) {
      if (s?.format === 'lottie') continue;
      consider(s?.url);
    }
  }
  if (Array.isArray(row.embeds)) {
    for (const raw of row.embeds) {
      if (!raw || typeof raw !== 'object') continue;
      const e = raw as Embed;
      consider(e.image?.url);
      consider(e.thumbnail?.url);
      consider(e.footer?.icon_url);
      consider(e.author?.icon_url);
    }
  }
  consider(row.forwardedFrom?.authorAvatar);
  if (row.replyTo && typeof row.replyTo === 'object') {
    const av = (row.replyTo as { authorAvatar?: unknown }).authorAvatar;
    if (typeof av === 'string') consider(av);
  }
  return [...keys];
}

export async function echoMessageHasMissingMirroredMedia(
  row: EchoMessageRow,
): Promise<boolean> {
  const keys = collectEchoMirroredDiscordImportStorageKeys(row);
  if (keys.length === 0) return false;
  for (const key of keys) {
    const status = await echoUploadObjectExists(key);
    if (status === 'missing') return true;
  }
  return false;
}

/**
 * Replace Echo (or stale Discord) media fields with fresh Discord CDN URLs
 * from a bot-exported message. Discord is source of truth for repair.
 */
export function buildForceRestoreMediaPatchFromBotMessage(
  row: EchoMessageRow,
  bot: BotFetchedMessage,
): Parameters<typeof updateEchoMessageDiscordImportMirroredMedia>[3] {
  const attachments = parseImportedAttachments(bot.attachments);
  const stickers = parseImportedStickers(bot.stickers);
  const embeds = parseImportedEmbeds(bot.embeds);

  let forwardedFrom: ForwardedFrom | undefined = row.forwardedFrom;
  if (bot.forwardedFrom && typeof bot.forwardedFrom === 'object') {
    const av = (bot.forwardedFrom as { authorAvatar?: unknown }).authorAvatar;
    if (typeof av === 'string' && av.trim() && forwardedFrom) {
      forwardedFrom = { ...forwardedFrom, authorAvatar: av.trim() };
    } else if (typeof av === 'string' && av.trim() && !forwardedFrom) {
      // Keep structure minimal — only avatar refresh when forward snapshot exists.
    }
  }

  let replyTo: ReplyTo | undefined;
  if (row.replyTo && typeof row.replyTo === 'object') {
    replyTo = row.replyTo as ReplyTo;
  }

  // Drop top-level media URLs when they were Echo mirrors; Discord attachments
  // carry the same assets after restore + remirror.
  const imageUrl =
    row.imageUrl && isDiscordHostedImportMediaUrl(row.imageUrl)
      ? row.imageUrl
      : row.imageUrl && isEchoMirroredDiscordImportUrl(row.imageUrl)
        ? undefined
        : row.imageUrl;
  const videoUrl =
    row.videoUrl && isDiscordHostedImportMediaUrl(row.videoUrl)
      ? row.videoUrl
      : row.videoUrl && isEchoMirroredDiscordImportUrl(row.videoUrl)
        ? undefined
        : row.videoUrl;
  const audioUrl =
    row.audioUrl && isDiscordHostedImportMediaUrl(row.audioUrl)
      ? row.audioUrl
      : row.audioUrl && isEchoMirroredDiscordImportUrl(row.audioUrl)
        ? undefined
        : row.audioUrl;

  return {
    // Discord export is source of truth for repair — clear Echo-mirrored media
    // when Discord no longer lists the asset.
    attachments: (attachments ?? []) as MessageAttachmentPayload[],
    stickers: (stickers ?? []) as MessageStickerPayload[],
    embeds: (embeds ?? []) as Embed[],
    imageUrl,
    videoUrl,
    audioUrl,
    ...(forwardedFrom ? { forwardedFrom } : {}),
    ...(replyTo ? { replyTo } : {}),
  };
}

export type RepairDiscordImportMediaResult =
  | {
      ok: true;
      restoredDiscordUrls: boolean;
      enqueue:
        | 'queued'
        | 'already_active'
        | 'pressure'
        | 'skipped_no_discord_media';
    }
  | {
      ok: false;
      reason:
        | 'message_not_found'
        | 'not_discord_bridged'
        | 'no_discord_channel'
        | 'bot_message_missing'
        | 'error';
      detail?: string;
    };

/**
 * Re-get media from Discord for one Echo message and requeue the mirror job.
 */
export async function repairDiscordImportMediaForMessage(
  pool: pg.Pool,
  echoChannelId: string,
  messageId: string,
  opts: { execute: boolean } = { execute: true },
): Promise<RepairDiscordImportMediaResult> {
  const row = await getEchoMessageById(pool, messageId);
  if (!row || row.channelId !== echoChannelId) {
    return { ok: false, reason: 'message_not_found' };
  }
  const bridge = (row.bridgeSource ?? '').trim();
  if (bridge !== 'discord_import' && bridge !== 'discord_inbound') {
    return { ok: false, reason: 'not_discord_bridged' };
  }

  const discordChannelId = await resolveDiscordChannelIdForEchoChannel(
    pool,
    echoChannelId,
  );
  if (!discordChannelId) {
    return { ok: false, reason: 'no_discord_channel' };
  }

  let botMessage: BotFetchedMessage | null;
  try {
    botMessage = await fetchDiscordMessageFromBot(discordChannelId, messageId);
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  if (!botMessage) {
    return { ok: false, reason: 'bot_message_missing' };
  }

  const patch = buildForceRestoreMediaPatchFromBotMessage(row, botMessage);
  const fakeNeedsMirror: EchoMessageRow = {
    ...row,
    attachments: patch.attachments,
    stickers: patch.stickers,
    embeds: patch.embeds,
    imageUrl: patch.imageUrl,
    videoUrl: patch.videoUrl,
    audioUrl: patch.audioUrl,
    forwardedFrom: patch.forwardedFrom,
    replyTo: patch.replyTo,
  };
  if (!echoMessageRowNeedsDiscordMediaMirror(fakeNeedsMirror)) {
    return {
      ok: true,
      restoredDiscordUrls: false,
      enqueue: 'skipped_no_discord_media',
    };
  }

  if (!opts.execute) {
    return { ok: true, restoredDiscordUrls: true, enqueue: 'queued' };
  }

  await updateEchoMessageDiscordImportMirroredMedia(
    pool,
    echoChannelId,
    messageId,
    patch,
  );

  const enqueue = await forceEnqueueDiscordImportMediaMirrorJob(pool, {
    messageId,
    channelId: echoChannelId,
    actorId: row.authorId,
  });

  return { ok: true, restoredDiscordUrls: true, enqueue };
}

export type ScanRepairOptions = {
  execute: boolean;
  /** Max messages to consider (default 200). */
  limit?: number;
  /** Only repair when Echo mirrored objects are missing (default true). */
  onlyMissing?: boolean;
};

/**
 * Scan Discord-bridged messages whose Echo mirror objects are missing and repair.
 */
export async function scanAndRepairMissingDiscordImportMedia(
  pool: pg.Pool,
  opts: ScanRepairOptions,
): Promise<{
  scanned: number;
  candidates: number;
  repaired: number;
  pressure: number;
  failed: number;
}> {
  const limit = Math.min(2000, Math.max(1, opts.limit ?? 200));
  const onlyMissing = opts.onlyMissing !== false;

  const rows = await listEchoMessagesWithDiscordImportMediaTokens(pool, limit);

  let candidates = 0;
  let repaired = 0;
  let pressure = 0;
  let failed = 0;

  for (const r of rows) {
    const msg = await getEchoMessageById(pool, r.id);
    if (!msg) continue;
    if (onlyMissing) {
      const missing = await echoMessageHasMissingMirroredMedia(msg);
      if (!missing) continue;
    }
    candidates += 1;
    const result = await repairDiscordImportMediaForMessage(
      pool,
      r.channelId,
      r.id,
      { execute: opts.execute },
    );
    if (!result.ok) {
      failed += 1;
      continue;
    }
    if (result.enqueue === 'pressure') {
      pressure += 1;
      continue;
    }
    if (result.restoredDiscordUrls) repaired += 1;
  }

  return {
    scanned: rows.length,
    candidates,
    repaired,
    pressure,
    failed,
  };
}
