import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { MessageAttachmentPayload } from '../../../shared/types';
import { config } from '../config';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { sanitizeEchoUploadObjectKeyFragment } from './echoUploadKeyUtils';
import { writeLocalEchoUploadFile } from './localUploadDisk';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isAllowedChatUploadContentType,
} from './s3UploadPresign';
import {
  WEBHOOK_EXECUTE_MAX_FILE_BYTES,
  WEBHOOK_EXECUTE_MAX_FILES,
} from './echoChannelWebhookExecuteConstants';

function inferAttachmentKind(
  contentType: string | null | undefined,
  filename: string,
): MessageAttachmentPayload['kind'] {
  const mime = (contentType ?? '').toLowerCase();
  const name = filename.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'document';
  if (
    mime === 'application/msword' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) {
    return 'document';
  }
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'image/gif' || name.endsWith('.gif')) return 'gif';
  return 'image';
}

function coerceAllowedChatContentType(
  headerCt: string | null | undefined,
  filenameHint?: string,
): string | null {
  const fromHeader = headerCt?.trim().toLowerCase();
  if (fromHeader && isAllowedChatUploadContentType(fromHeader)) return fromHeader;
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
    '.pdf': 'application/pdf',
  };
  const guessed = map[ext];
  if (guessed && isAllowedChatUploadContentType(guessed)) return guessed;
  return null;
}

export async function persistWebhookInboundFiles(opts: {
  pool: pg.Pool;
  serverId: string;
  channelId: string;
  messageId: string;
  files: { filename: string; buffer: Buffer; contentType?: string | null }[];
  log: FastifyBaseLogger;
}): Promise<
  { ok: true; attachments: MessageAttachmentPayload[] } | { ok: false; message: string }
> {
  if (opts.files.length > WEBHOOK_EXECUTE_MAX_FILES) {
    return { ok: false, message: 'Too many files.' };
  }
  const attachments: MessageAttachmentPayload[] = [];
  let idx = 0;
  for (const f of opts.files) {
    idx += 1;
    if (f.buffer.length > WEBHOOK_EXECUTE_MAX_FILE_BYTES) {
      return { ok: false, message: 'File too large.' };
    }
    const baseName =
      typeof f.filename === 'string' && f.filename.trim()
        ? path.basename(f.filename.trim())
        : 'upload.bin';
    const safe = sanitizeEchoUploadObjectKeyFragment(baseName) || 'upload.bin';
    const ct =
      coerceAllowedChatContentType(f.contentType ?? null, baseName) ??
      coerceAllowedChatContentType(null, baseName);
    if (!ct) {
      return { ok: false, message: 'Unsupported file type.' };
    }
    const objectKey = `wh-${idx}-${nextEchoSnowflakeId()}-${safe}`;
    const storageKey = `echo/webhook-inbound/${opts.serverId}/${opts.channelId}/${opts.messageId}/${objectKey}`;

    try {
      if (config.echoLocalUploadDir) {
        await writeLocalEchoUploadFile(storageKey, f.buffer);
        await opts.pool.query(
          `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
           VALUES ($1, $2)
           ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
          [storageKey, ct],
        );
      } else {
        const client = createEchoS3UploadClient();
        const bucket = getEchoS3UploadBucket();
        if (!client || !bucket) {
          return {
            ok: false,
            message: 'File storage is not configured on this server.',
          };
        }
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: storageKey,
            Body: f.buffer,
            ContentType: ct,
          }),
        );
      }
    } catch (e) {
      opts.log.error(
        { err: e, msg: 'echo_channel_webhook.file_store_failed' },
        'Webhook file store failed',
      );
      return { ok: false, message: 'Failed to store uploaded file.' };
    }

    const url = buildEchoUploadPublicUrlForStorageKey(storageKey);
    if (!url) {
      return { ok: false, message: 'Failed to build public URL for upload.' };
    }
    attachments.push({
      url,
      kind: inferAttachmentKind(ct, baseName),
      filename: baseName.slice(0, 256),
      mimeType: ct.slice(0, 128),
      fileSize: f.buffer.length,
    });
  }
  return { ok: true, attachments };
}
