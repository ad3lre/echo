import path from 'path';
import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type pg from 'pg';
import { config } from '../config';
import { isDiscordHostedImportMediaUrl } from '../domain/discordCdnUrls';
import {
  getEchoMessageById,
  updateEchoMessageDiscordImportMirroredMedia,
} from '../domain/echoMessagesDal';
import type { EchoMessageRow } from '../domain/echoMessagesDal';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import {
  echoMessageRowNeedsDiscordMediaMirror,
  markDiscordImportMediaMirrorDone,
  markDiscordImportMediaMirrorFailed,
  requeueDiscordImportMediaMirrorPending,
  type DiscordImportMediaMirrorJobRow,
} from './discordImportMediaMirrorQueue';
import { resolveEchoUploadStorageKey } from './echoUploadResolveDest';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isAllowedChatUploadContentType,
} from './s3UploadPresign';
import { writeLocalEchoUploadFile } from './localUploadDisk';
import { registerChatUploadRetention } from './chatUploadRetention';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageStickerPayload,
  ReplyTo,
} from '../../../shared/types';

const MIRROR_MAX_BYTES = 100 * 1024 * 1024;

function coerceAllowedChatContentType(
  headerCt: string | null | undefined,
  filenameHint?: string,
): string | null {
  const fromHeader = headerCt?.trim().toLowerCase();
  if (fromHeader && isAllowedChatUploadContentType(fromHeader))
    return fromHeader;
  const fn = (filenameHint ?? '').toLowerCase();
  const dot = fn.lastIndexOf('.');
  const ext = dot >= 0 ? fn.slice(dot) : '';
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  };
  const guessed = map[ext];
  if (guessed && isAllowedChatUploadContentType(guessed)) return guessed;
  return null;
}

function extForContentType(ct: string): string {
  const t = ct.toLowerCase();
  if (t === 'image/png') return '.png';
  if (t === 'image/jpeg') return '.jpg';
  if (t === 'image/gif') return '.gif';
  if (t === 'image/webp') return '.webp';
  if (t === 'video/webm') return '.webm';
  if (t === 'video/mp4') return '.mp4';
  if (t === 'video/quicktime') return '.mov';
  if (t === 'audio/mpeg') return '.mp3';
  if (t === 'audio/wav' || t === 'audio/x-wav') return '.wav';
  if (t === 'audio/ogg') return '.ogg';
  return '';
}

async function fetchDiscordMedia(
  url: string,
  maxBytes: number,
): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'EchoDiscordImportMirror/1.0' },
    signal: AbortSignal.timeout(120_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const cl = res.headers.get('content-length');
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > maxBytes)
      throw new Error('content-length exceeds cap');
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error('body exceeds cap');
  return { buf: Buffer.from(ab), contentType: ct };
}

async function mirrorDiscordUrlToEcho(opts: {
  pool: pg.Pool;
  actorId: string;
  channelId: string;
  discordUrl: string;
  filenameHint?: string;
  log: FastifyBaseLogger;
}): Promise<string | null> {
  const { pool, actorId, channelId, discordUrl, filenameHint, log } = opts;
  let buf: Buffer;
  let headerCt: string;
  try {
    const r = await fetchDiscordMedia(discordUrl, MIRROR_MAX_BYTES);
    buf = r.buf;
    headerCt = r.contentType;
  } catch (e) {
    log.debug(
      {
        err: e instanceof Error ? e.message : String(e),
        msg: 'discord_import_media_mirror.fetch_failed',
      },
      'Discord CDN fetch failed',
    );
    return null;
  }

  const ct =
    coerceAllowedChatContentType(headerCt, filenameHint) ??
    coerceAllowedChatContentType(null, filenameHint);
  if (!ct) {
    log.debug(
      { headerCt, filenameHint, msg: 'discord_import_media_mirror.bad_ct' },
      'Could not map Discord media to allowed chat content type',
    );
    return null;
  }

  const ext =
    (filenameHint && path.extname(filenameHint.trim())) ||
    extForContentType(ct) ||
    '.bin';
  const objectKey = `discord-import-media-${nextEchoSnowflakeId()}${ext}`;
  const dest = await resolveEchoUploadStorageKey(pool, actorId, {
    channelId,
    contentType: ct,
    objectKey,
  });
  if (!dest.ok) {
    log.debug(
      { msg: 'discord_import_media_mirror.dest_denied' },
      'Could not resolve upload destination for Discord mirror',
    );
    return null;
  }

  try {
    if (config.echoLocalUploadDir) {
      await writeLocalEchoUploadFile(dest.storageKey, buf);
      await pool.query(
        `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
         VALUES ($1, $2)
         ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
        [dest.storageKey, ct],
      );
    } else {
      const client = createEchoS3UploadClient();
      const bucket = getEchoS3UploadBucket();
      if (!client || !bucket) return null;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: dest.storageKey,
          Body: buf,
          ContentType: ct,
        }),
      );
    }
  } catch (e) {
    log.warn(
      {
        err: e instanceof Error ? e.message : String(e),
        msg: 'discord_import_media_mirror.store_failed',
      },
      'Failed to store mirrored Discord media',
    );
    return null;
  }

  await registerChatUploadRetention(pool, {
    storageKey: dest.storageKey,
    byteLength: buf.length,
    sourceType: 'import',
    uploaderId: actorId,
  });

  return buildEchoUploadPublicUrlForStorageKey(dest.storageKey) ?? null;
}

type UrlWork = { url: string; hint?: string };

function collectDiscordUrlWork(row: EchoMessageRow): UrlWork[] {
  const out: UrlWork[] = [];
  const push = (u: string | undefined, hint?: string) => {
    if (typeof u !== 'string' || !u.trim()) return;
    const t = u.trim();
    if (!isDiscordHostedImportMediaUrl(t)) return;
    out.push({ url: t, hint });
  };

  push(row.imageUrl, 'image.bin');
  push(row.videoUrl, 'video.bin');
  push(row.audioUrl, 'audio.bin');

  if (Array.isArray(row.attachments)) {
    for (const a of row.attachments) {
      if (a?.url) push(a.url, a.filename);
    }
  }
  if (Array.isArray(row.stickers)) {
    for (const s of row.stickers) {
      if (s?.url) push(s.url, `${s.id}.${s.format}`);
    }
  }
  if (Array.isArray(row.embeds)) {
    for (const e of row.embeds) {
      if (!e || typeof e !== 'object') continue;
      const emb = e as Embed;
      push(emb.image?.url, 'embed-image.bin');
      push(emb.thumbnail?.url, 'embed-thumb.bin');
      push(emb.footer?.icon_url, 'embed-footer.bin');
      push(emb.author?.icon_url, 'embed-author.bin');
    }
  }
  push(row.forwardedFrom?.authorAvatar, 'forward-avatar.bin');
  if (row.replyTo && typeof row.replyTo === 'object') {
    const av = (row.replyTo as { authorAvatar?: unknown }).authorAvatar;
    if (typeof av === 'string') push(av, 'reply-avatar.bin');
  }
  return out;
}

function dedupeWork(items: UrlWork[]): UrlWork[] {
  const seen = new Set<string>();
  const out: UrlWork[] = [];
  for (const w of items) {
    if (seen.has(w.url)) continue;
    seen.add(w.url);
    out.push(w);
  }
  return out;
}

function patchAttachments(
  att: MessageAttachmentPayload[] | undefined,
  urlMap: Map<string, string>,
): MessageAttachmentPayload[] | undefined {
  if (!Array.isArray(att)) return undefined;
  return att.map((a) => {
    const n = urlMap.get(a.url.trim());
    return n ? { ...a, url: n } : a;
  });
}

function patchStickers(
  st: MessageStickerPayload[] | undefined,
  urlMap: Map<string, string>,
): MessageStickerPayload[] | undefined {
  if (!Array.isArray(st)) return undefined;
  return st.map((s) => {
    const n = urlMap.get(s.url.trim());
    return n ? { ...s, url: n } : s;
  });
}

function patchEmbedsInPlace(
  embeds: unknown,
  urlMap: Map<string, string>,
): unknown {
  if (!Array.isArray(embeds)) return embeds;
  const out: Embed[] = [];
  for (const raw of embeds) {
    if (!raw || typeof raw !== 'object') continue;
    const emb: Embed = { ...(raw as Embed) };
    if (emb.image?.url) {
      const n = urlMap.get(emb.image.url.trim());
      if (n) emb.image = { ...emb.image, url: n };
    }
    if (emb.thumbnail?.url) {
      const n = urlMap.get(emb.thumbnail.url.trim());
      if (n) emb.thumbnail = { ...emb.thumbnail, url: n };
    }
    if (emb.footer?.icon_url) {
      const n = urlMap.get(emb.footer.icon_url.trim());
      if (n) emb.footer = { ...emb.footer, icon_url: n };
    }
    if (emb.author?.icon_url) {
      const n = urlMap.get(emb.author.icon_url.trim());
      if (n) emb.author = { ...emb.author, icon_url: n };
    }
    out.push(emb);
  }
  return out;
}

function patchForwarded(
  fwd: ForwardedFrom | undefined,
  urlMap: Map<string, string>,
): ForwardedFrom | undefined {
  if (!fwd?.authorAvatar) return fwd;
  const n = urlMap.get(fwd.authorAvatar.trim());
  if (!n) return fwd;
  return { ...fwd, authorAvatar: n };
}

function patchReply(
  replyTo: unknown,
  urlMap: Map<string, string>,
): ReplyTo | undefined {
  if (!replyTo || typeof replyTo !== 'object') return undefined;
  const o = replyTo as ReplyTo & Record<string, unknown>;
  const av = o.authorAvatar;
  if (typeof av !== 'string' || !av.trim()) return o as ReplyTo;
  const n = urlMap.get(av.trim());
  if (!n) return o as ReplyTo;
  return { ...o, authorAvatar: n };
}

function mergeRowAfterMirror(
  row: EchoMessageRow,
  urlMap: Map<string, string>,
): Parameters<typeof updateEchoMessageDiscordImportMirroredMedia>[3] {
  const imageUrl = row.imageUrl
    ? (urlMap.get(row.imageUrl.trim()) ?? row.imageUrl)
    : undefined;
  const videoUrl = row.videoUrl
    ? (urlMap.get(row.videoUrl.trim()) ?? row.videoUrl)
    : undefined;
  const audioUrl = row.audioUrl
    ? (urlMap.get(row.audioUrl.trim()) ?? row.audioUrl)
    : undefined;
  const embedsPatched = Array.isArray(row.embeds)
    ? (patchEmbedsInPlace(row.embeds, urlMap) as Embed[])
    : undefined;
  return {
    attachments: row.attachments
      ? patchAttachments(row.attachments, urlMap)!
      : undefined,
    stickers: row.stickers ? patchStickers(row.stickers, urlMap)! : undefined,
    embeds: embedsPatched,
    imageUrl,
    videoUrl,
    audioUrl,
    forwardedFrom: row.forwardedFrom
      ? patchForwarded(row.forwardedFrom, urlMap)
      : undefined,
    replyTo: row.replyTo ? patchReply(row.replyTo, urlMap) : undefined,
  };
}

export async function processDiscordImportMediaMirrorJob(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  job: DiscordImportMediaMirrorJobRow,
): Promise<void> {
  const messageId = job.message_id;
  const channelId = job.channel_id;
  const actorId = job.actor_id;

  try {
    await runDiscordImportMediaMirrorJobBody(
      pool,
      io,
      log,
      job,
      messageId,
      channelId,
      actorId,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(
      { err: msg, msg: 'discord_import_media_mirror.unexpected' },
      'Discord import media mirror job crashed',
    );
    await markDiscordImportMediaMirrorFailed(pool, messageId, msg);
  }
}

async function runDiscordImportMediaMirrorJobBody(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  job: DiscordImportMediaMirrorJobRow,
  messageId: string,
  channelId: string,
  actorId: string,
): Promise<void> {
  const row = await getEchoMessageById(pool, messageId);
  if (!row || row.channelId !== channelId) {
    await markDiscordImportMediaMirrorDone(pool, messageId);
    return;
  }

  if (!echoMessageRowNeedsDiscordMediaMirror(row)) {
    await markDiscordImportMediaMirrorDone(pool, messageId);
    return;
  }

  const work = dedupeWork(collectDiscordUrlWork(row));
  const urlMap = new Map<string, string>();
  for (const w of work) {
    if (urlMap.has(w.url)) continue;
    const echoUrl = await mirrorDiscordUrlToEcho({
      pool,
      actorId,
      channelId,
      discordUrl: w.url,
      filenameHint: w.hint,
      log,
    });
    if (echoUrl) urlMap.set(w.url, echoUrl);
  }

  if (urlMap.size === 0) {
    if (job.attempts >= 12) {
      await markDiscordImportMediaMirrorFailed(
        pool,
        messageId,
        'Could not mirror Discord media after max attempts',
      );
    } else {
      await requeueDiscordImportMediaMirrorPending(pool, messageId);
    }
    return;
  }

  const patch = mergeRowAfterMirror(row, urlMap);
  await updateEchoMessageDiscordImportMirroredMedia(
    pool,
    channelId,
    messageId,
    patch,
  );

  const refreshed = await getEchoMessageById(pool, messageId);
  if (io && refreshed) {
    broadcastToEchoChannel(io, channelId, 'message:media_mirror', {
      channelId,
      messageId,
      ...(refreshed.attachments?.length
        ? { attachments: refreshed.attachments }
        : {}),
      ...(refreshed.stickers?.length ? { stickers: refreshed.stickers } : {}),
      ...(Array.isArray(refreshed.embeds) && refreshed.embeds.length > 0
        ? { embeds: refreshed.embeds as Embed[] }
        : {}),
      ...(refreshed.imageUrl?.trim() ? { imageUrl: refreshed.imageUrl } : {}),
      ...(refreshed.videoUrl?.trim() ? { videoUrl: refreshed.videoUrl } : {}),
      ...(refreshed.audioUrl?.trim() ? { audioUrl: refreshed.audioUrl } : {}),
      ...(refreshed.forwardedFrom
        ? { forwardedFrom: refreshed.forwardedFrom }
        : {}),
      ...(refreshed.replyTo ? { replyTo: refreshed.replyTo as ReplyTo } : {}),
    });
  }

  if (refreshed && echoMessageRowNeedsDiscordMediaMirror(refreshed)) {
    if (job.attempts >= 12) {
      await markDiscordImportMediaMirrorFailed(
        pool,
        messageId,
        'Some Discord media URLs could not be mirrored',
      );
    } else {
      await requeueDiscordImportMediaMirrorPending(pool, messageId);
    }
    return;
  }

  await markDiscordImportMediaMirrorDone(pool, messageId);
}
