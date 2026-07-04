import type {
  MentionEntity,
  MessageAttachmentPayload,
} from '../../../shared/types';
import { CHAT_E2EE_REMOVED_DETAIL } from '../../../shared/chatE2eePolicy';
import { ECHO_CONTENT_SCHEMA_VERSION } from '../../../shared/echoMessageFormatV2';
import { isEchoPublicId } from '../../../shared/snowflakeIds';
import {
  validateContentJsonForWrite,
  validateContentJsonSchemaVersionForDoc,
} from '../domain/contentJsonValidation';
import { countImageSlots } from '../../../shared/imageSlotContentJson';
import { countButtonRows } from '../../../shared/buttonRowContentJson';
import type { EchoPollStoredDefinition } from '../domain/echoPollVotesDal';
import { projectPlainAndMentionsFromContentJson } from '../domain/messagePlainTextProjection';
import { isEchoS3UploadConfigured } from '../services/s3UploadPresign';
import { mediaUrlPassesEchoPolicy } from '../services/mediaUrlPolicy';
import { echoE2eeEnvelopeRejectedTotal } from '../observability/echoMetrics';
import { sanitizeAttachmentStorageKey } from './sanitizeAttachmentStorageKey';

export const MAX_MESSAGE_LENGTH = 4000;
/** Serialized `encryption.envelope` JSON must stay small (server stores JSONB / logs). */
export const MAX_E2EE_ENVELOPE_BYTES = 65_536;
export const MAX_E2EE_ENVELOPE_JSON_DEPTH = 40;

function jsonMaxDepthForE2eeEnvelope(v: unknown, depth = 0): number {
  if (depth > MAX_E2EE_ENVELOPE_JSON_DEPTH + 2) return depth;
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) {
      let m = depth;
      for (const x of v)
        m = Math.max(m, jsonMaxDepthForE2eeEnvelope(x, depth + 1));
      return m;
    }
    let m = depth;
    for (const k of Object.keys(v as Record<string, unknown>)) {
      m = Math.max(
        m,
        jsonMaxDepthForE2eeEnvelope(
          (v as Record<string, unknown>)[k],
          depth + 1,
        ),
      );
    }
    return m;
  }
  return depth;
}

export type EchoE2eeEnvelopeRejectReason =
  | 'envelope_not_serializable'
  | 'envelope_too_large'
  | 'envelope_too_deep';

export function validateE2eeEnvelopeWire(
  envelope: unknown,
):
  | { ok: true; serializedLength: number }
  | { ok: false; error: string; reason: EchoE2eeEnvelopeRejectReason } {
  let s: string;
  try {
    s = JSON.stringify(envelope);
  } catch {
    return {
      ok: false,
      error: 'Invalid message: encryption.envelope not JSON-serializable',
      reason: 'envelope_not_serializable',
    };
  }
  if (s.length > MAX_E2EE_ENVELOPE_BYTES) {
    return {
      ok: false,
      error: 'Invalid message: encryption.envelope too large',
      reason: 'envelope_too_large',
    };
  }
  if (jsonMaxDepthForE2eeEnvelope(envelope) > MAX_E2EE_ENVELOPE_JSON_DEPTH) {
    return {
      ok: false,
      error: 'Invalid message: encryption.envelope too deep',
      reason: 'envelope_too_deep',
    };
  }
  return { ok: true, serializedLength: s.length };
}

function validateE2eeV2CiphertextWire(
  ciphertext: string,
): { ok: true } | { ok: false; error: string; reason: string } {
  let o: unknown;
  try {
    o = JSON.parse(ciphertext) as unknown;
  } catch {
    return {
      ok: false,
      error: 'Invalid message: encryption v2 ciphertext must be JSON',
      reason: 'e2ee_v2_ciphertext_json',
    };
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    return {
      ok: false,
      error: 'Invalid message: encryption v2 ciphertext invalid',
      reason: 'e2ee_v2_ciphertext_shape',
    };
  }
  const rec = o as Record<string, unknown>;
  if (rec.kind !== 'echo-e2ee-v2') {
    return {
      ok: false,
      error: 'Invalid message: encryption v2 ciphertext kind invalid',
      reason: 'e2ee_v2_kind',
    };
  }
  if (!Array.isArray(rec.parts) || rec.parts.length < 1) {
    return {
      ok: false,
      error: 'Invalid message: encryption v2 ciphertext parts required',
      reason: 'e2ee_v2_parts',
    };
  }
  if (rec.parts.length > 24) {
    return {
      ok: false,
      error: 'Invalid message: encryption v2 too many device parts',
      reason: 'e2ee_v2_parts_cap',
    };
  }
  for (const part of rec.parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      return {
        ok: false,
        error: 'Invalid message: encryption v2 part invalid',
        reason: 'e2ee_v2_part_shape',
      };
    }
    const p = part as Record<string, unknown>;
    const tpid = p.targetProtocolDeviceId;
    if (
      typeof tpid !== 'number' ||
      !Number.isInteger(tpid) ||
      tpid < 1 ||
      tpid > 1_000_000
    ) {
      return {
        ok: false,
        error:
          'Invalid message: encryption v2 part targetProtocolDeviceId invalid',
        reason: 'e2ee_v2_target_pid',
      };
    }
    if (typeof p.type !== 'number' || !Number.isInteger(p.type)) {
      return {
        ok: false,
        error: 'Invalid message: encryption v2 part type invalid',
        reason: 'e2ee_v2_type',
      };
    }
    if (typeof p.body !== 'string' || !p.body.trim()) {
      return {
        ok: false,
        error: 'Invalid message: encryption v2 part body invalid',
        reason: 'e2ee_v2_body',
      };
    }
    if (
      p.registrationId !== undefined &&
      p.registrationId !== null &&
      (typeof p.registrationId !== 'number' ||
        !Number.isInteger(p.registrationId))
    ) {
      return {
        ok: false,
        error: 'Invalid message: encryption v2 part registrationId invalid',
        reason: 'e2ee_v2_reg',
      };
    }
  }
  return { ok: true };
}

function rejectE2eeWire(
  reason: string,
  error: string,
): { ok: false; error: string } {
  echoE2eeEnvelopeRejectedTotal.labels(reason).inc();
  return { ok: false, error };
}

export const MAX_POLL_QUESTION_LENGTH = 500;
export const MAX_POLL_OPTION_TEXT_LENGTH = 200;
export const MAX_POLL_OPTIONS = 10;
export const MIN_POLL_OPTIONS = 2;
/** Legacy max when object storage is off (data URLs from client). */
export const MAX_MEDIA_URL_LENGTH = 25_000_000;
/** Data URL payload cap (decoded bytes) when object storage is disabled. */
export const MAX_DATA_URL_BYTES = 10 * 1024 * 1024;
/** Max length for normal https(s) media URLs (object storage + external GIF CDNs). */
export const MAX_HTTPS_MEDIA_URL_LENGTH = 8192;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;
const ALLOWED_DATA_URL_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const CLIENT_MSG_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidClientMessageId(id: string): boolean {
  return CLIENT_MSG_ID_RE.test(id) || isEchoPublicId(id);
}

type IncomingMention = Partial<MentionEntity> & {
  kind?: string;
};

export function sanitizeMentions(
  mentions: unknown,
  content: string,
): MentionEntity[] | undefined {
  if (!Array.isArray(mentions)) return undefined;

  const sanitized = mentions
    .filter((mention): mention is IncomingMention => {
      if (!mention || typeof mention !== 'object') return false;
      if (typeof mention.id !== 'string' || !mention.id.trim()) return false;
      if (
        !['user', 'everyone', 'active', 'channel', 'role'].includes(
          String(mention.kind),
        )
      )
        return false;
      if (typeof mention.label !== 'string' || !mention.label.trim())
        return false;
      if (typeof mention.start !== 'number' || typeof mention.end !== 'number')
        return false;
      if (!Number.isInteger(mention.start) || !Number.isInteger(mention.end))
        return false;
      if (
        mention.start < 0 ||
        mention.end <= mention.start ||
        mention.end > content.length
      )
        return false;
      if (
        mention.kind === 'user' &&
        (typeof mention.userId !== 'string' || !mention.userId.trim())
      ) {
        return false;
      }
      if (
        mention.kind === 'channel' &&
        (typeof mention.channelId !== 'string' || !mention.channelId.trim())
      ) {
        return false;
      }
      if (
        mention.kind === 'role' &&
        (typeof mention.roleId !== 'string' || !mention.roleId.trim())
      ) {
        return false;
      }
      return true;
    })
    .map((mention) => ({
      ...(mention as MentionEntity),
      id: mention.id!.trim(),
      label: mention.label!.trim(),
      ...(mention.userId ? { userId: mention.userId.trim() } : {}),
      ...(mention.channelId ? { channelId: mention.channelId.trim() } : {}),
      ...(mention.roleId ? { roleId: mention.roleId.trim() } : {}),
    }));

  return sanitized.length ? sanitized : undefined;
}

/** Returns definition suitable for JSONB storage (no vote tallies). */
export function sanitizePollForStorage(
  raw: unknown,
): EchoPollStoredDefinition | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const question = typeof o.question === 'string' ? o.question.trim() : '';
  if (question.length < 1 || question.length > MAX_POLL_QUESTION_LENGTH)
    return undefined;
  const optsRaw = o.options;
  if (!Array.isArray(optsRaw)) return undefined;
  if (optsRaw.length < MIN_POLL_OPTIONS || optsRaw.length > MAX_POLL_OPTIONS)
    return undefined;
  const seenIds = new Set<string>();
  const options: EchoPollStoredDefinition['options'] = [];
  for (const item of optsRaw) {
    if (!item || typeof item !== 'object') return undefined;
    const it = item as Record<string, unknown>;
    const id = typeof it.id === 'string' ? it.id.trim() : '';
    if (
      !id ||
      id.length > 128 ||
      !isValidClientMessageId(id) ||
      seenIds.has(id)
    )
      return undefined;
    seenIds.add(id);
    const text = typeof it.text === 'string' ? it.text.trim() : '';
    if (text.length < 1 || text.length > MAX_POLL_OPTION_TEXT_LENGTH)
      return undefined;
    let emoji: string | undefined;
    if (it.emoji !== undefined && it.emoji !== null && it.emoji !== '') {
      if (typeof it.emoji !== 'string') return undefined;
      const e = it.emoji.trim();
      if (e.length > 64) return undefined;
      emoji = e;
    }
    options.push({ id, text, ...(emoji ? { emoji } : {}) });
  }
  let endsAt: string | undefined;
  if (o.endsAt != null && o.endsAt !== '') {
    if (typeof o.endsAt !== 'string') return undefined;
    const d = new Date(o.endsAt);
    if (Number.isNaN(d.getTime())) return undefined;
    endsAt = d.toISOString();
  }
  const anonymous = o.anonymous === true;
  return {
    question,
    options,
    ...(endsAt ? { endsAt } : {}),
    ...(anonymous ? { anonymous: true } : {}),
  };
}

function sanitizeMediaUrl(value: unknown): string | undefined {
  const blockData = isEchoS3UploadConfigured();
  return sanitizeMediaUrlInner(value, blockData);
}

function sanitizeMediaUrlInner(
  value: unknown,
  blockDataUrls: boolean,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  if (!t) return undefined;
  if (t.startsWith('data:')) {
    if (blockDataUrls) return undefined;
    if (t.length > MAX_MEDIA_URL_LENGTH) return undefined;
    const comma = t.indexOf(',');
    if (comma <= 5) return undefined;
    const meta = t.slice(5, comma).trim();
    const payload = t.slice(comma + 1);
    const metaParts = meta.split(';').map((s) => s.trim().toLowerCase());
    const mime = metaParts[0] ?? '';
    if (!ALLOWED_DATA_URL_MIME_TYPES.has(mime)) return undefined;
    const isBase64 = metaParts.includes('base64');
    const decodedBytes = isBase64
      ? Math.floor((payload.length * 3) / 4)
      : payload.length;
    if (!Number.isFinite(decodedBytes) || decodedBytes < 1) return undefined;
    if (decodedBytes > MAX_DATA_URL_BYTES) return undefined;
    return t;
  }
  if (t.length > MAX_HTTPS_MEDIA_URL_LENGTH) return undefined;
  if (!mediaUrlPassesEchoPolicy(t)) return undefined;
  return t;
}

function sanitizeAttachmentDimensions(o: Record<string, unknown>): {
  width?: number;
  height?: number;
} {
  const widthRaw = o.width;
  const heightRaw = o.height;
  const width =
    typeof widthRaw === 'number' &&
    Number.isFinite(widthRaw) &&
    widthRaw > 0 &&
    widthRaw <= 65535
      ? Math.floor(widthRaw)
      : undefined;
  const height =
    typeof heightRaw === 'number' &&
    Number.isFinite(heightRaw) &&
    heightRaw > 0 &&
    heightRaw <= 65535
      ? Math.floor(heightRaw)
      : undefined;
  if (width && height) return { width, height };
  return {};
}

function sanitizeAttachments(
  raw: unknown,
  blockDataUrls: boolean,
): MessageAttachmentPayload[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  if (raw.length === 0) return undefined;
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) return undefined;
  const out: MessageAttachmentPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return undefined;
    const o = item as Record<string, unknown>;
    const url = sanitizeMediaUrlInner(o.url, blockDataUrls);
    if (!url) return undefined;
    const kind = o.kind;
    if (
      kind !== 'image' &&
      kind !== 'video' &&
      kind !== 'gif' &&
      kind !== 'audio' &&
      kind !== 'document'
    )
      return undefined;
    const filename =
      typeof o.filename === 'string' && o.filename.trim()
        ? o.filename.trim().slice(0, 256)
        : undefined;
    const mimeType =
      typeof o.mimeType === 'string' && o.mimeType.trim()
        ? o.mimeType.trim().slice(0, 128)
        : undefined;
    const spoiler = o.spoiler === true;
    const fileSizeRaw = o.fileSize;
    const fileSize =
      typeof fileSizeRaw === 'number' &&
      Number.isFinite(fileSizeRaw) &&
      fileSizeRaw >= 0 &&
      fileSizeRaw <= Number.MAX_SAFE_INTEGER
        ? Math.floor(fileSizeRaw)
        : undefined;
    const dims = sanitizeAttachmentDimensions(o);
    const storageKey = sanitizeAttachmentStorageKey(o.storageKey);
    out.push({
      url,
      kind,
      ...(filename ? { filename } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(typeof fileSize === 'number' ? { fileSize } : {}),
      ...dims,
      ...(storageKey ? { storageKey } : {}),
      ...(spoiler ? { spoiler: true } : {}),
    });
  }
  return out;
}

export function validateMessagePayload(payload: unknown):
  | {
      ok: true;
      value: {
        channelId: string;
        content: string;
        mentions?: MentionEntity[];
        replyTo?: unknown;
        /** Client-generated snowflake (or legacy UUID) for idempotent send / optimistic UI reconciliation */
        clientMessageId?: string;
        correlationId?: string;
        imageUrl?: string;
        videoUrl?: string;
        gif?: boolean;
        imageSpoiler?: boolean;
        poll?: EchoPollStoredDefinition;
        attachments?: MessageAttachmentPayload[];
        /** Client sticker ids — resolved server-side into canonical sticker payloads. */
        stickerIds?: string[];
        /** TipTap JSON when `messageFormatVersion === 2`. */
        contentJson?: unknown;
        messageFormatVersion: number;
        contentSchemaVersion: number;
        forwardMessageId?: string;
      };
    }
  | {
      ok: false;
      error: string;
    } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid message: payload required' };
  }

  const p = payload as Record<string, unknown>;
  if (p.contentText !== undefined || p.search_index_text !== undefined) {
    return {
      ok: false,
      error: 'Invalid message: server-owned plain fields are not accepted',
    };
  }

  const {
    channelId,
    content,
    mentions,
    replyTo,
    id,
    correlationId: rawCorr,
    imageUrl: rawImageUrl,
    videoUrl: rawVideoUrl,
    gif: rawGif,
    imageSpoiler: rawImageSpoiler,
    poll: rawPoll,
    attachments: rawAttachments,
    stickerIds: rawStickerIds,
    contentJson: rawContentJson,
    contentSchemaVersion: rawContentSchemaVersion,
    forwardMessageId: rawForwardMessageId,
    encryption: rawEncryption,
  } = p as {
    channelId?: unknown;
    content?: unknown;
    mentions?: unknown;
    replyTo?: unknown;
    id?: unknown;
    correlationId?: unknown;
    imageUrl?: unknown;
    videoUrl?: unknown;
    gif?: unknown;
    imageSpoiler?: unknown;
    poll?: unknown;
    attachments?: unknown;
    stickerIds?: unknown;
    contentJson?: unknown;
    contentSchemaVersion?: unknown;
    forwardMessageId?: unknown;
    encryption?: unknown;
  };

  let correlationId: string | undefined;
  if (typeof rawCorr === 'string') {
    const c = rawCorr.trim();
    if (c.length > 0 && c.length <= 128) correlationId = c;
  }

  let forwardMessageId: string | undefined;
  if (rawForwardMessageId !== undefined && rawForwardMessageId !== null) {
    if (
      typeof rawForwardMessageId !== 'string' ||
      !rawForwardMessageId.trim()
    ) {
      return {
        ok: false,
        error: 'Invalid message: forwardMessageId invalid',
      };
    }
    const f = rawForwardMessageId.trim();
    if (!isValidClientMessageId(f)) {
      return {
        ok: false,
        error: 'Invalid message: forwardMessageId must be a valid message id',
      };
    }
    forwardMessageId = f;
  }

  if (typeof channelId !== 'string' || !channelId.trim()) {
    return { ok: false, error: 'Invalid message: channelId required' };
  }

  const hasContentJson =
    rawContentJson !== undefined && rawContentJson !== null;
  if (hasContentJson && typeof rawContentJson !== 'object') {
    return {
      ok: false,
      error: 'Invalid message: contentJson must be an object',
    };
  }

  if (typeof content !== 'string') {
    return { ok: false, error: 'Invalid message: content must be string' };
  }

  if (rawEncryption !== undefined && rawEncryption !== null) {
    return rejectE2eeWire('chat_e2ee_removed', CHAT_E2EE_REMOVED_DETAIL);
  }

  let contentSchemaVersion = ECHO_CONTENT_SCHEMA_VERSION;
  if (
    rawContentSchemaVersion !== undefined &&
    rawContentSchemaVersion !== null
  ) {
    if (
      typeof rawContentSchemaVersion !== 'number' ||
      !Number.isInteger(rawContentSchemaVersion) ||
      rawContentSchemaVersion < 1
    ) {
      return {
        ok: false,
        error: 'Invalid message: contentSchemaVersion invalid',
      };
    }
    if (rawContentSchemaVersion > ECHO_CONTENT_SCHEMA_VERSION) {
      return {
        ok: false,
        error: 'Invalid message: contentSchemaVersion not supported',
      };
    }
    contentSchemaVersion = rawContentSchemaVersion;
  }

  let pollDef: EchoPollStoredDefinition | undefined;
  if (rawPoll !== undefined && rawPoll !== null) {
    pollDef = sanitizePollForStorage(rawPoll);
    if (!pollDef) {
      return { ok: false, error: 'Invalid message: poll is malformed' };
    }
  }

  const blockData = isEchoS3UploadConfigured();
  const imageUrl = sanitizeMediaUrlInner(rawImageUrl, blockData);
  const videoUrl = sanitizeMediaUrlInner(rawVideoUrl, blockData);
  const imageSpoiler = rawImageSpoiler === true;
  const attachments = sanitizeAttachments(rawAttachments, blockData);
  const gif =
    rawGif === true || (attachments?.some((a) => a.kind === 'gif') ?? false);
  let stickerIds: string[] | undefined;
  if (rawStickerIds !== undefined && rawStickerIds !== null) {
    if (!Array.isArray(rawStickerIds)) {
      return { ok: false, error: 'Invalid message: stickerIds must be array' };
    }
    if (rawStickerIds.length > 3) {
      return { ok: false, error: 'Invalid message: too many stickers' };
    }
    const ids: string[] = [];
    for (const raw of rawStickerIds) {
      if (typeof raw !== 'string') {
        return { ok: false, error: 'Invalid message: sticker id invalid' };
      }
      const id = raw.trim();
      if (!id || !isEchoPublicId(id)) {
        return { ok: false, error: 'Invalid message: sticker id invalid' };
      }
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length > 0) stickerIds = ids;
  }
  if (
    rawImageUrl !== undefined &&
    rawImageUrl !== null &&
    imageUrl === undefined &&
    typeof rawImageUrl === 'string' &&
    rawImageUrl.trim()
  ) {
    return {
      ok: false,
      error: blockData
        ? 'Invalid message: imageUrl must be a short https URL when uploads are configured (data URLs are not allowed)'
        : 'Invalid message: imageUrl too long or invalid',
    };
  }
  if (
    rawVideoUrl !== undefined &&
    rawVideoUrl !== null &&
    videoUrl === undefined &&
    typeof rawVideoUrl === 'string' &&
    rawVideoUrl.trim()
  ) {
    return {
      ok: false,
      error: blockData
        ? 'Invalid message: videoUrl must be a short https URL when uploads are configured'
        : 'Invalid message: videoUrl too long or invalid',
    };
  }
  if (
    rawAttachments !== undefined &&
    rawAttachments !== null &&
    attachments === undefined
  ) {
    return {
      ok: false,
      error: 'Invalid message: attachments malformed or too many',
    };
  }

  if (
    attachments &&
    attachments.length > 0 &&
    (imageUrl || videoUrl || rawGif === true)
  ) {
    return {
      ok: false,
      error:
        'Invalid message: use attachments or legacy image/video/gif fields, not both',
    };
  }

  if (pollDef && stickerIds && stickerIds.length > 0) {
    return {
      ok: false,
      error: 'Invalid message: poll cannot be combined with stickers',
    };
  }

  if (
    pollDef &&
    (imageUrl || videoUrl || gif || (attachments && attachments.length))
  ) {
    return {
      ok: false,
      error: 'Invalid message: poll cannot be combined with media',
    };
  }

  const hasMedia = !!(
    imageUrl ||
    videoUrl ||
    gif ||
    (attachments && attachments.length > 0) ||
    (stickerIds && stickerIds.length > 0)
  );

  if (forwardMessageId) {
    if (replyTo !== undefined && replyTo !== null) {
      return {
        ok: false,
        error: 'Invalid message: cannot combine forward and reply',
      };
    }
    if (pollDef) {
      return {
        ok: false,
        error: 'Invalid message: cannot forward with a poll',
      };
    }
    if (hasMedia) {
      return {
        ok: false,
        error: 'Invalid message: cannot forward with attachments or media',
      };
    }
  }

  let clientMessageId: string | undefined;
  if (id !== undefined) {
    if (typeof id !== 'string' || !isValidClientMessageId(id)) {
      return {
        ok: false,
        error: 'Invalid message: id must be a UUID v4 or Echo public id',
      };
    }
    clientMessageId = id;
  }

  if (hasContentJson) {
    const docCheck = validateContentJsonForWrite(rawContentJson);
    if (!docCheck.ok) {
      return { ok: false, error: `Invalid message: ${docCheck.error}` };
    }
    const schemaErr = validateContentJsonSchemaVersionForDoc(
      docCheck.doc,
      contentSchemaVersion,
    );
    if (schemaErr) {
      return { ok: false, error: `Invalid message: ${schemaErr}` };
    }
    const imageSlotCount = countImageSlots(docCheck.doc);
    const buttonRowCount = countButtonRows(docCheck.doc);
    if (forwardMessageId && (imageSlotCount > 0 || buttonRowCount > 0)) {
      return {
        ok: false,
        error: 'Invalid message: cannot forward with rich content blocks',
      };
    }
    const { plain, mentions: serverMentions } =
      projectPlainAndMentionsFromContentJson(docCheck.doc);
    if (plain.length > MAX_MESSAGE_LENGTH) {
      return {
        ok: false,
        error: 'Invalid message: derived plain text too long',
      };
    }
    if (
      !pollDef &&
      !hasMedia &&
      !plain.trim() &&
      imageSlotCount === 0 &&
      buttonRowCount === 0 &&
      !forwardMessageId
    ) {
      return { ok: false, error: 'Invalid message: empty message' };
    }
    const outMentions = serverMentions.length ? serverMentions : undefined;
    return {
      ok: true,
      value: {
        channelId,
        content: plain,
        mentions: outMentions,
        contentJson: docCheck.doc,
        messageFormatVersion: 2,
        contentSchemaVersion,
        replyTo,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(correlationId ? { correlationId } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(videoUrl ? { videoUrl } : {}),
        ...(gif ? { gif: true } : {}),
        ...(imageSpoiler ? { imageSpoiler: true } : {}),
        ...(pollDef ? { poll: pollDef } : {}),
        ...(attachments && attachments.length ? { attachments } : {}),
        ...(stickerIds && stickerIds.length ? { stickerIds } : {}),
        ...(forwardMessageId ? { forwardMessageId } : {}),
      },
    };
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: 'Invalid message: content too long' };
  }
  if (!pollDef && !hasMedia && !content.trim() && !forwardMessageId) {
    return { ok: false, error: 'Invalid message: empty message' };
  }

  return {
    ok: true,
    value: {
      channelId,
      content,
      mentions: sanitizeMentions(mentions, content),
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
      replyTo,
      ...(clientMessageId ? { clientMessageId } : {}),
      ...(correlationId ? { correlationId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(gif ? { gif: true } : {}),
      ...(imageSpoiler ? { imageSpoiler: true } : {}),
      ...(pollDef ? { poll: pollDef } : {}),
      ...(attachments && attachments.length ? { attachments } : {}),
      ...(stickerIds && stickerIds.length ? { stickerIds } : {}),
      ...(forwardMessageId ? { forwardMessageId } : {}),
    },
  };
}

export type EchoMessageEditValidated =
  | {
      channelId: string;
      messageId: string;
      correlationId?: string;
      editKind: 'legacy';
      content: string;
      /** Present when client sends `attachments` — replaces column (`[]` clears). */
      attachments?: MessageAttachmentPayload[];
    }
  | {
      channelId: string;
      messageId: string;
      correlationId?: string;
      editKind: 'json';
      content: string;
      contentJson: unknown;
      contentSchemaVersion: number;
      mentions?: MentionEntity[];
      attachments?: MessageAttachmentPayload[];
    };

/** Edit payload: JSON path migrates v1 → v2; v2 rows require `contentJson` (no legacy-only edit). */
export function validateMessageEditPayload(
  payload: unknown,
  opts: { existingMessageFormatVersion: number },
):
  | { ok: true; value: EchoMessageEditValidated }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid edit: payload required' };
  }
  const p = payload as Record<string, unknown>;
  if (
    p.contentText !== undefined ||
    p.search_index_text !== undefined ||
    p.mentionsResolved !== undefined
  ) {
    return {
      ok: false,
      error: 'Invalid edit: server-owned fields are not accepted',
    };
  }

  const channelId = typeof p.channelId === 'string' ? p.channelId.trim() : '';
  const messageId = typeof p.messageId === 'string' ? p.messageId.trim() : '';
  if (!channelId)
    return { ok: false, error: 'Invalid edit: channelId required' };
  if (!messageId || !isValidClientMessageId(messageId)) {
    return { ok: false, error: 'Invalid edit: messageId required' };
  }

  let correlationId: string | undefined;
  if (typeof p.correlationId === 'string') {
    const c = p.correlationId.trim();
    if (c.length > 0 && c.length <= 128) correlationId = c;
  }

  const blockData = isEchoS3UploadConfigured();
  let attachmentsReplace: MessageAttachmentPayload[] | undefined = undefined;
  if ('attachments' in p) {
    const raw = p.attachments;
    if (raw === null || raw === undefined) {
      return { ok: false, error: 'Invalid edit: attachments invalid' };
    }
    if (!Array.isArray(raw)) {
      return { ok: false, error: 'Invalid edit: attachments must be an array' };
    }
    if (raw.length === 0) {
      attachmentsReplace = [];
    } else {
      const sanitized = sanitizeAttachments(raw, blockData);
      if (!sanitized) {
        return {
          ok: false,
          error: 'Invalid edit: attachments malformed or too many',
        };
      }
      attachmentsReplace = sanitized;
    }
  }

  const rawContentJson = p.contentJson;
  const hasContentJson =
    rawContentJson !== undefined && rawContentJson !== null;
  if (hasContentJson && typeof rawContentJson !== 'object') {
    return { ok: false, error: 'Invalid edit: contentJson must be an object' };
  }

  const rawContentSchemaVersion = p.contentSchemaVersion;
  let contentSchemaVersion = ECHO_CONTENT_SCHEMA_VERSION;
  if (
    rawContentSchemaVersion !== undefined &&
    rawContentSchemaVersion !== null
  ) {
    if (
      typeof rawContentSchemaVersion !== 'number' ||
      !Number.isInteger(rawContentSchemaVersion) ||
      rawContentSchemaVersion < 1
    ) {
      return { ok: false, error: 'Invalid edit: contentSchemaVersion invalid' };
    }
    if (rawContentSchemaVersion > ECHO_CONTENT_SCHEMA_VERSION) {
      return {
        ok: false,
        error: 'Invalid edit: contentSchemaVersion not supported',
      };
    }
    contentSchemaVersion = rawContentSchemaVersion;
  }

  if (hasContentJson) {
    const docCheck = validateContentJsonForWrite(rawContentJson);
    if (!docCheck.ok) {
      return { ok: false, error: `Invalid edit: ${docCheck.error}` };
    }
    const schemaErr = validateContentJsonSchemaVersionForDoc(
      docCheck.doc,
      contentSchemaVersion,
    );
    if (schemaErr) {
      return { ok: false, error: `Invalid edit: ${schemaErr}` };
    }
    const imageSlotCount = countImageSlots(docCheck.doc);
    const buttonRowCount = countButtonRows(docCheck.doc);
    const { plain, mentions: serverMentions } =
      projectPlainAndMentionsFromContentJson(docCheck.doc);
    if (plain.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: 'Invalid edit: derived plain text too long' };
    }
    const hasNonEmptyAttachments =
      attachmentsReplace !== undefined && attachmentsReplace.length > 0;
    if (
      !plain.trim() &&
      !hasNonEmptyAttachments &&
      imageSlotCount === 0 &&
      buttonRowCount === 0
    ) {
      return { ok: false, error: 'Invalid edit: empty message' };
    }
    const outMentions = serverMentions.length ? serverMentions : undefined;
    return {
      ok: true,
      value: {
        channelId,
        messageId,
        editKind: 'json',
        content: plain,
        contentJson: docCheck.doc,
        contentSchemaVersion,
        ...(outMentions ? { mentions: outMentions } : {}),
        ...(correlationId ? { correlationId } : {}),
        ...(attachmentsReplace !== undefined
          ? { attachments: attachmentsReplace }
          : {}),
      },
    };
  }

  if (opts.existingMessageFormatVersion >= 2) {
    return {
      ok: false,
      error: 'Invalid edit: contentJson required for this message',
    };
  }

  const content = typeof p.content === 'string' ? p.content : '';
  if (!content.trim()) {
    return { ok: false, error: 'Invalid edit: content required' };
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: 'Invalid edit: content too long' };
  }

  return {
    ok: true,
    value: {
      channelId,
      messageId,
      editKind: 'legacy',
      content: content.trim(),
      ...(correlationId ? { correlationId } : {}),
      ...(attachmentsReplace !== undefined
        ? { attachments: attachmentsReplace }
        : {}),
    },
  };
}

export function validateImageSlotFillPayload(payload: unknown):
  | {
      ok: true;
      value: {
        channelId: string;
        messageId: string;
        slotId: string;
        imageUrl: string;
        storageKey?: string;
        width?: number;
        height?: number;
        correlationId?: string;
      };
    }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid fill: payload required' };
  }
  const p = payload as Record<string, unknown>;
  const channelId = typeof p.channelId === 'string' ? p.channelId.trim() : '';
  const messageId = typeof p.messageId === 'string' ? p.messageId.trim() : '';
  const slotId = typeof p.slotId === 'string' ? p.slotId.trim() : '';
  if (!channelId)
    return { ok: false, error: 'Invalid fill: channelId required' };
  if (!messageId || !isValidClientMessageId(messageId)) {
    return { ok: false, error: 'Invalid fill: messageId required' };
  }
  if (!slotId || slotId.length > 64) {
    return { ok: false, error: 'Invalid fill: slotId required' };
  }
  const blockData = isEchoS3UploadConfigured();
  const imageUrl = sanitizeMediaUrlInner(p.imageUrl, blockData);
  if (!imageUrl) {
    return { ok: false, error: 'Invalid fill: imageUrl required' };
  }
  let storageKey: string | undefined;
  if (p.storageKey !== undefined && p.storageKey !== null) {
    if (typeof p.storageKey !== 'string') {
      return { ok: false, error: 'Invalid fill: storageKey invalid' };
    }
    const sk = p.storageKey.trim();
    if (!sk || sk.length > 512) {
      return { ok: false, error: 'Invalid fill: storageKey invalid' };
    }
    storageKey = sk;
  }
  const dims = sanitizeAttachmentDimensions(p);
  let correlationId: string | undefined;
  if (typeof p.correlationId === 'string') {
    const c = p.correlationId.trim();
    if (c.length > 0 && c.length <= 128) correlationId = c;
  }
  return {
    ok: true,
    value: {
      channelId,
      messageId,
      slotId,
      imageUrl,
      ...(storageKey ? { storageKey } : {}),
      ...dims,
      ...(correlationId ? { correlationId } : {}),
    },
  };
}

export function validatePollVotePayload(payload: unknown):
  | {
      ok: true;
      value: {
        channelId: string;
        messageId: string;
        optionId: string;
        correlationId?: string;
      };
    }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid poll vote: payload required' };
  }
  const o = payload as Record<string, unknown>;
  const channelId = typeof o.channelId === 'string' ? o.channelId.trim() : '';
  const messageId = typeof o.messageId === 'string' ? o.messageId.trim() : '';
  const optionId = typeof o.optionId === 'string' ? o.optionId.trim() : '';
  if (!channelId)
    return { ok: false, error: 'Invalid poll vote: channelId required' };
  if (!messageId || !isValidClientMessageId(messageId)) {
    return { ok: false, error: 'Invalid poll vote: messageId required' };
  }
  if (!optionId || optionId.length > 128 || !isValidClientMessageId(optionId)) {
    return { ok: false, error: 'Invalid poll vote: optionId invalid' };
  }
  let correlationId: string | undefined;
  if (typeof o.correlationId === 'string') {
    const c = o.correlationId.trim();
    if (c.length > 0 && c.length <= 128) correlationId = c;
  }
  return {
    ok: true,
    value: {
      channelId,
      messageId,
      optionId,
      ...(correlationId ? { correlationId } : {}),
    },
  };
}
