/**
 * Single module allowed to contain `echo_messages` table SQL (see repo check:echo-messages-dal).
 */
import type pg from 'pg';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageReaction,
  MessageStickerPayload,
  PollData,
  ReplyTo,
} from '../../../shared/types';
import {
  type EchoPollStoredDefinition,
  listPollVotesForMessages,
  mergePollVotesIntoDefinition,
} from './echoPollVotesDal';
import { resolveDiscordAvatarForStorage } from './discordNormalized';
import {
  ECHO_MESSAGE_TIMELINE_ORDER_DESC,
  echoMessageIdPgGreaterThan,
} from './echoMessageIdPgCompare';
import { ECHO_WEBHOOK_BRIDGE_SOURCE } from './echoChannelWebhookConstants';
import {
  CHAT_E2EE_REMOVED_DETAIL,
  contentForLegacyEncryptedChatRow,
  rowHasLegacyChatE2eeCiphertext,
} from '../../../shared/chatE2eePolicy';

export { CHAT_E2EE_REMOVED_DETAIL };

/** Strip chat E2EE wire fields from REST/socket rows; legacy ciphertext → placeholder text. */
export function stripChatE2eeFromEchoMessageRow(
  row: EchoMessageRow,
): EchoMessageRow {
  const hasE2ee = rowHasLegacyChatE2eeCiphertext(row.e2eeCiphertext);
  if (!hasE2ee) {
    const {
      e2eeEnvelope: _e,
      e2eeCiphertext: _c,
      e2eeSenderDeviceId: _s,
      ...rest
    } = row;
    return rest;
  }
  const content = contentForLegacyEncryptedChatRow(
    row.content,
    row.e2eeCiphertext,
  );
  const {
    e2eeEnvelope: _env,
    e2eeCiphertext: _ct,
    e2eeSenderDeviceId: _dev,
    ...rest
  } = row;
  return { ...rest, content };
}

export function stripChatE2eeFromEchoMessageRows(
  rows: EchoMessageRow[],
): EchoMessageRow[] {
  return rows.map(stripChatE2eeFromEchoMessageRow);
}

export type EchoMessageRow = {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  mentions?: unknown;
  replyTo?: unknown;
  embeds?: unknown;
  timestamp: string;
  editedAt?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  poll?: PollData;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  reactions?: MessageReaction[];
  /** TipTap JSON body when `messageFormatVersion >= 2`. */
  contentJson?: unknown;
  searchIndexText?: string;
  messageFormatVersion?: number;
  contentSchemaVersion?: number;
  e2eeEnvelope?: unknown;
  e2eeCiphertext?: string;
  e2eeSenderDeviceId?: string;
  /** Enriched from `auth_users` for REST/socket payloads (not a DB column on echo_messages). */
  authorDisplayName?: string;
  authorAvatar?: string;
  authorIsDiscordShadow?: boolean;
  /** Discord snowflake for import shadow authors (for twin ownership on clients). */
  authorDiscordUserId?: string;
  /** Persisted system event row (centered muted UI; not a normal chat bubble). */
  systemMessage?: boolean;
  /** When set, message was mirrored from Discord inbound bridge. */
  bridgeSource?: string;
  /** Derived for clients when `bridgeSource` is discord inbound. */
  bridgeFromDiscord?: boolean;
  forwardedFrom?: ForwardedFrom;
  /** When `bridgeSource` is `echo_webhook`, the originating webhook row id. */
  sourceWebhookId?: string;
  /** Resolved display name for webhook-delivered messages (may include per-execute override). */
  webhookUsername?: string;
  webhookAvatarUrl?: string;
  tts?: boolean;
  messageFlags?: number;
  components?: unknown;
};

type MsgRowDraft = Omit<EchoMessageRow, 'poll'> & {
  pollStored?: EchoPollStoredDefinition;
};

export function parseEchoPollStoredColumn(
  raw: unknown,
): EchoPollStoredDefinition | undefined {
  if (raw == null) return undefined;
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  if (typeof p.question !== 'string' || !Array.isArray(p.options))
    return undefined;
  return v as EchoPollStoredDefinition;
}

function parseAttachmentsColumn(
  raw: unknown,
): MessageAttachmentPayload[] | undefined {
  if (raw == null) return undefined;
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(v)) return undefined;
  if (v.length === 0) return [];
  const out: MessageAttachmentPayload[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') return undefined;
    const o = item as Record<string, unknown>;
    if (typeof o.url !== 'string' || !o.url.trim()) return undefined;
    const kind = o.kind;
    if (
      kind !== 'image' &&
      kind !== 'video' &&
      kind !== 'gif' &&
      kind !== 'audio' &&
      kind !== 'document'
    )
      return undefined;
    const fileSizeRaw = o.fileSize;
    const fileSize =
      typeof fileSizeRaw === 'number' &&
      Number.isFinite(fileSizeRaw) &&
      fileSizeRaw >= 0 &&
      fileSizeRaw <= Number.MAX_SAFE_INTEGER
        ? Math.floor(fileSizeRaw)
        : undefined;
    out.push({
      url: o.url.trim(),
      kind,
      ...(typeof o.filename === 'string' && o.filename.trim()
        ? { filename: o.filename.trim().slice(0, 256) }
        : {}),
      ...(typeof o.mimeType === 'string' && o.mimeType.trim()
        ? { mimeType: o.mimeType.trim().slice(0, 128) }
        : {}),
      ...(typeof fileSize === 'number' ? { fileSize } : {}),
      ...(o.spoiler === true ? { spoiler: true } : {}),
    });
  }
  return out.length ? out : undefined;
}

function parseStickersColumn(
  raw: unknown,
): MessageStickerPayload[] | undefined {
  if (raw == null) return undefined;
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out: MessageStickerPayload[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') return undefined;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    const format = o.format;
    if (!id || !name || !url) return undefined;
    if (
      format !== 'png' &&
      format !== 'apng' &&
      format !== 'gif' &&
      format !== 'lottie'
    ) {
      return undefined;
    }
    out.push({ id, name, format, url });
  }
  return out.length ? out : undefined;
}

function parseComponentsColumn(raw: unknown): unknown | undefined {
  if (raw == null) return undefined;
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  return v;
}

function mapMsgRowsDraft(rows: { [k: string]: unknown }[]): MsgRowDraft[] {
  return rows.map((row) => {
    const pollStored = parseEchoPollStoredColumn(row.poll);
    const attachments = parseAttachmentsColumn(row.attachments);
    const stickers = parseStickersColumn(row.stickers);
    const components = parseComponentsColumn(row.components);
    const forwardedFrom = parseForwardOfColumn(row.forward_of);
    const mf =
      row.message_format_version != null
        ? Number(row.message_format_version)
        : 1;
    const cs =
      row.content_schema_version != null
        ? Number(row.content_schema_version)
        : 1;
    const sit =
      row.search_index_text != null && String(row.search_index_text) !== ''
        ? String(row.search_index_text)
        : undefined;
    const base: MsgRowDraft = {
      id: String(row.id),
      channelId: String(row.channel_id),
      authorId: String(row.author_id),
      content: String(row.content),
      mentions: row.mentions ?? undefined,
      replyTo: row.reply_to ?? undefined,
      embeds: row.embeds ?? undefined,
      timestamp: new Date(row.created_at as string | Date).toISOString(),
      ...(row.content_json != null ? { contentJson: row.content_json } : {}),
      ...(sit ? { searchIndexText: sit } : {}),
      messageFormatVersion: mf,
      contentSchemaVersion: cs,
      ...(row.e2ee_envelope != null ? { e2eeEnvelope: row.e2ee_envelope } : {}),
      ...(row.e2ee_ciphertext != null &&
      String(row.e2ee_ciphertext).trim() !== ''
        ? { e2eeCiphertext: String(row.e2ee_ciphertext) }
        : {}),
      ...(row.e2ee_sender_device_id != null &&
      String(row.e2ee_sender_device_id).trim() !== ''
        ? { e2eeSenderDeviceId: String(row.e2ee_sender_device_id) }
        : {}),
      ...(row.edited_at
        ? { editedAt: new Date(row.edited_at as string | Date).toISOString() }
        : {}),
      ...(row.image_url != null && String(row.image_url).trim() !== ''
        ? { imageUrl: String(row.image_url) }
        : {}),
      ...(row.video_url != null && String(row.video_url).trim() !== ''
        ? { videoUrl: String(row.video_url) }
        : {}),
      ...(row.audio_url != null && String(row.audio_url).trim() !== ''
        ? { audioUrl: String(row.audio_url) }
        : {}),
      ...(row.gif === true ? { gif: true } : {}),
      ...(row.image_spoiler === true ? { imageSpoiler: true } : {}),
      ...(pollStored ? { pollStored } : {}),
      ...(attachments ? { attachments } : {}),
      ...(stickers ? { stickers } : {}),
      ...(forwardedFrom ? { forwardedFrom } : {}),
      ...(row.system_message === true ? { systemMessage: true } : {}),
      ...(row.bridge_source != null && String(row.bridge_source).trim() !== ''
        ? { bridgeSource: String(row.bridge_source).trim() }
        : {}),
      ...(row.source_webhook_id != null &&
      String(row.source_webhook_id).trim() !== ''
        ? { sourceWebhookId: String(row.source_webhook_id).trim() }
        : {}),
      ...(row.webhook_username != null &&
      String(row.webhook_username).trim() !== ''
        ? { webhookUsername: String(row.webhook_username).trim() }
        : {}),
      ...(row.webhook_avatar_url != null &&
      String(row.webhook_avatar_url).trim() !== ''
        ? { webhookAvatarUrl: String(row.webhook_avatar_url).trim() }
        : {}),
      ...(row.tts === true ? { tts: true } : {}),
      ...(row.message_flags != null &&
      Number.isFinite(Number(row.message_flags))
        ? { messageFlags: Number(row.message_flags) }
        : {}),
      ...(components !== undefined ? { components } : {}),
    };
    return base;
  });
}

function parseForwardOfColumn(raw: unknown): ForwardedFrom | undefined {
  if (raw == null) return undefined;
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const messageId = typeof o.messageId === 'string' ? o.messageId.trim() : '';
  const channelId = typeof o.channelId === 'string' ? o.channelId.trim() : '';
  const authorName =
    typeof o.authorName === 'string' ? o.authorName.trim() : '';
  const contentPreview =
    typeof o.contentPreview === 'string' ? o.contentPreview : '';
  if (!messageId || !channelId || !authorName) return undefined;
  const authorAvatar =
    typeof o.authorAvatar === 'string' && o.authorAvatar.trim()
      ? o.authorAvatar.trim()
      : undefined;
  return {
    messageId,
    channelId,
    authorName,
    ...(authorAvatar ? { authorAvatar } : {}),
    contentPreview,
  };
}

export async function attachAuthorLabelsToEchoMessageRows(
  pool: pg.Pool,
  rows: EchoMessageRow[],
): Promise<EchoMessageRow[]> {
  if (rows.length === 0) return rows;
  const ids = [...new Set(rows.map((r) => r.authorId).filter(Boolean))];
  if (ids.length === 0) return rows;
  const r = await pool.query(
    `
    SELECT u.id,
      COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown') AS display_label,
      TRIM(u.pfp) AS pfp_trim,
      u.is_discord_shadow,
      d.discord_user_id AS shadow_discord_user_id
    FROM auth_users u
    LEFT JOIN echo_discord_shadow_users d ON d.shadow_user_id = u.id
    WHERE u.id = ANY($1::text[])
    `,
    [ids],
  );
  const byId = new Map<
    string,
    {
      name: string;
      pfp: string;
      isDiscordShadow: boolean;
      shadowDiscordUserId?: string;
    }
  >();
  for (const row of r.rows) {
    const id = String(row.id);
    const name = String(row.display_label ?? 'Unknown');
    const pfpRaw = row.pfp_trim != null ? String(row.pfp_trim) : '';
    const shadowDid =
      row.shadow_discord_user_id != null
        ? String(row.shadow_discord_user_id).trim()
        : '';
    const pfp =
      row.is_discord_shadow === true && shadowDid
        ? resolveDiscordAvatarForStorage(
            shadowDid,
            pfpRaw === '' ? null : pfpRaw,
          )
        : pfpRaw;
    byId.set(id, {
      name,
      pfp,
      isDiscordShadow: row.is_discord_shadow === true,
      ...(shadowDid ? { shadowDiscordUserId: shadowDid } : {}),
    });
  }
  return rows.map((row) => {
    const a = byId.get(row.authorId);
    if (!a) {
      return stripChatE2eeFromEchoMessageRow({
        ...row,
        authorDisplayName: 'Unknown',
      });
    }
    const baseLabeled = {
      ...row,
      authorDisplayName: a.name,
      ...(a.pfp ? { authorAvatar: a.pfp } : {}),
      authorIsDiscordShadow: a.isDiscordShadow,
      ...(a.isDiscordShadow && a.shadowDiscordUserId
        ? { authorDiscordUserId: a.shadowDiscordUserId }
        : {}),
      ...(row.bridgeSource === 'discord_inbound'
        ? { bridgeFromDiscord: true }
        : {}),
    };
    if (row.bridgeSource === ECHO_WEBHOOK_BRIDGE_SOURCE) {
      const wname = row.webhookUsername?.trim();
      const wav = row.webhookAvatarUrl?.trim();
      const { authorAvatar: _ignoredAvatar, ...restLabeled } = baseLabeled;
      return stripChatE2eeFromEchoMessageRow({
        ...restLabeled,
        authorDisplayName:
          wname && wname.length > 0 ? wname.slice(0, 80) : 'Webhook',
        ...(wav && wav.length > 0 ? { authorAvatar: wav.slice(0, 2048) } : {}),
      });
    }
    return stripChatE2eeFromEchoMessageRow(baseLabeled);
  });
}

async function finalizePollRows(
  pool: pg.Pool,
  drafts: MsgRowDraft[],
): Promise<EchoMessageRow[]> {
  const ids = drafts.filter((d) => d.pollStored).map((d) => d.id);
  const voteMap = ids.length
    ? await listPollVotesForMessages(pool, ids)
    : new Map<string, { userId: string; optionId: string }[]>();
  return drafts.map((d) => {
    if (!d.pollStored) {
      const { pollStored: _p, ...rest } = d;
      return rest as EchoMessageRow;
    }
    const poll = mergePollVotesIntoDefinition(
      d.pollStored,
      voteMap.get(d.id) ?? [],
    );
    const { pollStored: _p, ...rest } = d;
    return { ...rest, poll };
  });
}

const SELECT_MSG_FIELDS_BASE = `
  id, channel_id, author_id, content, mentions, reply_to, forward_of, embeds, poll,
  image_url, video_url, audio_url, gif, image_spoiler, attachments, stickers,
  created_at, edited_at,
  content_json, search_index_text, message_format_version, content_schema_version,
  bridge_source, system_message, source_webhook_id, webhook_username, webhook_avatar_url,
  tts, message_flags, components`;

/** Cached after first Postgres probe; false when migration for E2EE columns has not been applied. */
let echoMessagesE2eeColumnsResolved: boolean | null = null;

/**
 * True when `echo_messages` has both `e2ee_envelope` and `e2ee_ciphertext` (migration applied).
 * Result is cached for the process so existing deployments without those columns keep working.
 */
export async function echoMessagesTableHasE2eeColumns(
  pool: pg.Pool,
): Promise<boolean> {
  if (echoMessagesE2eeColumnsResolved !== null) {
    return echoMessagesE2eeColumnsResolved;
  }
  const r = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'echo_messages'
      AND column_name IN ('e2ee_envelope', 'e2ee_ciphertext')
    `,
  );
  const names = new Set(
    r.rows.map((x) => String((x as { column_name: unknown }).column_name)),
  );
  echoMessagesE2eeColumnsResolved =
    names.has('e2ee_envelope') && names.has('e2ee_ciphertext');
  return echoMessagesE2eeColumnsResolved;
}

function selectEchoMessageRowSqlFields(hasE2eeColumns: boolean): string {
  const b = SELECT_MSG_FIELDS_BASE.replace(/\s+/g, ' ').trim();
  return hasE2eeColumns
    ? `${b}, e2ee_envelope, e2ee_ciphertext, e2ee_sender_device_id`
    : b;
}

const REACTION_EMOJI_MAX = 128;

/** Unicode or custom key; trim, length limit, no ASCII control characters. */
export function normalizeReactionEmojiKey(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > REACTION_EMOJI_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

export async function listAggregatedReactionsForMessages(
  pool: pg.Pool,
  messageIds: string[],
): Promise<Map<string, MessageReaction[]>> {
  const out = new Map<string, MessageReaction[]>();
  if (messageIds.length === 0) return out;
  const r = await pool.query(
    `
    SELECT
      message_id,
      emoji,
      array_agg(user_id ORDER BY user_id) AS user_ids,
      COUNT(*)::int AS reaction_count,
      MAX(created_at) AS last_reaction_at
    FROM echo_message_reactions
    WHERE message_id = ANY($1::text[])
    GROUP BY message_id, emoji
    ORDER BY message_id, reaction_count DESC, last_reaction_at DESC, emoji ASC
    `,
    [messageIds],
  );
  for (const row of r.rows) {
    const mid = String(row.message_id);
    const emoji = String(row.emoji);
    const rawIds = row.user_ids as unknown;
    const userIds = Array.isArray(rawIds) ? rawIds.map((x) => String(x)) : [];
    const count = Number(row.reaction_count ?? userIds.length);
    const lastRaw = row.last_reaction_at;
    const lastReactionAt =
      lastRaw != null
        ? new Date(lastRaw as string | Date).toISOString()
        : undefined;
    const entry: MessageReaction = {
      emoji,
      count,
      userIds,
      ...(lastReactionAt ? { lastReactionAt } : {}),
    };
    const arr = out.get(mid) ?? [];
    arr.push(entry);
    out.set(mid, arr);
  }
  return out;
}

async function attachReactionsToRows(
  pool: pg.Pool,
  rows: EchoMessageRow[],
): Promise<EchoMessageRow[]> {
  if (rows.length === 0) return rows;
  const map = await listAggregatedReactionsForMessages(
    pool,
    rows.map((x) => x.id),
  );
  return rows.map((row) => {
    const reactions = map.get(row.id);
    if (!reactions?.length) return row;
    return { ...row, reactions };
  });
}

function mergeParallelEnrichedEchoMessageRows(
  finalized: EchoMessageRow[],
  withRx: EchoMessageRow[],
  labeled: EchoMessageRow[],
): EchoMessageRow[] {
  return finalized.map((fin, i) => {
    const lab = labeled[i]!;
    const rx = withRx[i]!;
    return {
      ...lab,
      poll: fin.poll,
      ...(rx.reactions?.length ? { reactions: rx.reactions } : {}),
    };
  });
}

async function timedEnrichmentMs<T>(fn: () => Promise<T>): Promise<{
  result: T;
  ms: number;
}> {
  const t0 = process.hrtime.bigint();
  const result = await fn();
  return { result, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

async function enrichEchoMessageDraftsParallel(
  pool: pg.Pool,
  drafts: MsgRowDraft[],
): Promise<{
  rows: EchoMessageRow[];
  pollMs: number;
  reactionsMs: number;
  authorsMs: number;
}> {
  const baseRows = drafts as EchoMessageRow[];
  const [poll, reactions, authors] = await Promise.all([
    timedEnrichmentMs(() => finalizePollRows(pool, drafts)),
    timedEnrichmentMs(() => attachReactionsToRows(pool, baseRows)),
    timedEnrichmentMs(() =>
      attachAuthorLabelsToEchoMessageRows(pool, baseRows),
    ),
  ]);
  return {
    rows: mergeParallelEnrichedEchoMessageRows(
      poll.result,
      reactions.result,
      authors.result,
    ),
    pollMs: poll.ms,
    reactionsMs: reactions.ms,
    authorsMs: authors.ms,
  };
}

export async function userHasEchoMessageReaction(
  pool: pg.Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  const q = await pool.query(
    `SELECT 1 FROM echo_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3 LIMIT 1`,
    [messageId, userId, emoji],
  );
  return q.rows.length > 0;
}

export async function upsertEchoMessageReaction(
  pool: pg.Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_message_reactions (message_id, user_id, emoji)
    VALUES ($1, $2, $3)
    ON CONFLICT (message_id, user_id, emoji) DO NOTHING
    `,
    [messageId, userId, emoji],
  );
}

export async function removeEchoMessageReaction(
  pool: pg.Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, userId, emoji],
  );
}

export async function insertEchoMessage(
  pool: pg.Pool,
  row: {
    id: string;
    channelId: string;
    authorId: string;
    content: string;
    mentions?: unknown;
    replyTo?: unknown;
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    gif?: boolean;
    imageSpoiler?: boolean;
    poll?: EchoPollStoredDefinition;
    attachments?: MessageAttachmentPayload[];
    stickers?: MessageStickerPayload[];
    contentJson?: unknown;
    searchIndexText?: string | null;
    messageFormatVersion?: number;
    contentSchemaVersion?: number;
    forwardedFrom?: ForwardedFrom;
    embeds?: Embed[];
    e2eeEnvelope?: unknown;
    e2eeCiphertext?: string;
    e2eeSenderDeviceId?: string;
    /** e.g. `discord_inbound` for bridge — skips Echo→Discord mirror. */
    bridgeSource?: string;
    systemMessage?: boolean;
    sourceWebhookId?: string;
    webhookUsername?: string | null;
    webhookAvatarUrl?: string | null;
    tts?: boolean;
    messageFlags?: number | null;
    components?: unknown;
  },
): Promise<'inserted' | 'duplicate'> {
  const m = row.mentions !== undefined ? JSON.stringify(row.mentions) : null;
  const r = row.replyTo !== undefined ? JSON.stringify(row.replyTo) : null;
  const fwd =
    row.forwardedFrom !== undefined ? JSON.stringify(row.forwardedFrom) : null;
  const pollJson = row.poll ? JSON.stringify(row.poll) : null;
  const attachmentsJson =
    row.attachments && row.attachments.length > 0
      ? JSON.stringify(row.attachments)
      : null;
  const stickersJson =
    row.stickers && row.stickers.length > 0
      ? JSON.stringify(row.stickers)
      : null;
  const mf = row.messageFormatVersion ?? 1;
  const cs = row.contentSchemaVersion ?? 1;
  const sit =
    row.searchIndexText === null ? null : (row.searchIndexText ?? row.content);
  const cj =
    row.contentJson !== undefined ? JSON.stringify(row.contentJson) : null;
  const e2eeEnvelopeJson =
    row.e2eeEnvelope !== undefined ? JSON.stringify(row.e2eeEnvelope) : null;
  const e2eeCiphertext =
    typeof row.e2eeCiphertext === 'string' && row.e2eeCiphertext.trim()
      ? row.e2eeCiphertext
      : null;
  const e2eeSenderDeviceId =
    typeof row.e2eeSenderDeviceId === 'string' && row.e2eeSenderDeviceId.trim()
      ? row.e2eeSenderDeviceId.trim()
      : null;
  const wantsE2ee =
    typeof row.e2eeCiphertext === 'string' &&
    row.e2eeCiphertext.trim().length > 0;
  const embedsJson =
    row.embeds && row.embeds.length > 0 ? JSON.stringify(row.embeds) : null;
  const bridgeSrc =
    typeof row.bridgeSource === 'string' && row.bridgeSource.trim()
      ? row.bridgeSource.trim().slice(0, 64)
      : null;
  const systemMessage = row.systemMessage === true;
  const sourceWebhookId =
    typeof row.sourceWebhookId === 'string' && row.sourceWebhookId.trim()
      ? row.sourceWebhookId.trim()
      : null;
  const webhookUsername =
    typeof row.webhookUsername === 'string' && row.webhookUsername.trim()
      ? row.webhookUsername.trim().slice(0, 80)
      : null;
  const webhookAvatarUrl =
    typeof row.webhookAvatarUrl === 'string' && row.webhookAvatarUrl.trim()
      ? row.webhookAvatarUrl.trim().slice(0, 2048)
      : null;
  const tts = row.tts === true;
  const messageFlags =
    row.messageFlags != null &&
    Number.isFinite(Number(row.messageFlags)) &&
    Number(row.messageFlags) >= 0
      ? Math.floor(Number(row.messageFlags))
      : null;
  const componentsJson =
    row.components !== undefined ? JSON.stringify(row.components) : null;

  const hasE2eeCols = await echoMessagesTableHasE2eeColumns(pool);
  if (wantsE2ee && !hasE2eeCols) {
    throw new Error('E2EE_STORAGE_UNAVAILABLE');
  }

  const baseParams = [
    row.id,
    row.channelId,
    row.authorId,
    row.content,
    m,
    r,
    fwd,
    row.imageUrl?.trim() || null,
    row.videoUrl?.trim() || null,
    row.audioUrl?.trim() || null,
    row.gif === true,
    row.imageSpoiler === true,
    pollJson,
    attachmentsJson,
    stickersJson,
    cj,
    sit,
    mf,
    cs,
    embedsJson,
  ];

  const ins = hasE2eeCols
    ? await pool.query(
        `
    INSERT INTO echo_messages (
      id, channel_id, author_id, content, mentions, reply_to, forward_of,
      image_url, video_url, audio_url, gif, image_spoiler, poll, attachments, stickers,
      edited_at, deleted_at,
      content_json, search_index_text, message_format_version, content_schema_version,
      embeds,
      e2ee_envelope, e2ee_ciphertext, e2ee_sender_device_id,
      source_webhook_id, webhook_username, webhook_avatar_url,
      tts, message_flags, components,
      bridge_source, system_message
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, NULL, NULL,
      $16::jsonb, $17, $18, $19,
      $20::jsonb,
      $21::jsonb, $22, $23,
      $24, $25, $26, $27, $28, $29::jsonb, $30, $31)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
    `,
        [
          ...baseParams,
          e2eeEnvelopeJson,
          e2eeCiphertext,
          e2eeSenderDeviceId,
          sourceWebhookId,
          webhookUsername,
          webhookAvatarUrl,
          tts,
          messageFlags,
          componentsJson,
          bridgeSrc,
          systemMessage,
        ],
      )
    : await pool.query(
        `
    INSERT INTO echo_messages (
      id, channel_id, author_id, content, mentions, reply_to, forward_of,
      image_url, video_url, audio_url, gif, image_spoiler, poll, attachments, stickers,
      edited_at, deleted_at,
      content_json, search_index_text, message_format_version, content_schema_version,
      embeds,
      source_webhook_id, webhook_username, webhook_avatar_url,
      tts, message_flags, components,
      bridge_source, system_message
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, NULL, NULL,
      $16::jsonb, $17, $18, $19,
      $20::jsonb,
      $21, $22, $23, $24, $25, $26::jsonb, $27, $28)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
    `,
        [
          ...baseParams,
          sourceWebhookId,
          webhookUsername,
          webhookAvatarUrl,
          tts,
          messageFlags,
          componentsJson,
          bridgeSrc,
          systemMessage,
        ],
      );
  return ins.rows.length > 0 ? 'inserted' : 'duplicate';
}

export async function getEchoMessageById(
  pool: pg.Pool,
  messageId: string,
): Promise<EchoMessageRow | null> {
  const hasE2ee = await echoMessagesTableHasE2eeColumns(pool);
  const q = await pool.query(
    `
    SELECT ${selectEchoMessageRowSqlFields(hasE2ee)}
    FROM echo_messages WHERE id = $1 AND deleted_at IS NULL
    `,
    [messageId],
  );
  if (!q.rows.length) return null;
  const drafts = mapMsgRowsDraft(q.rows);
  const enriched = await enrichEchoMessageDraftsParallel(pool, drafts);
  return enriched.rows[0] ?? null;
}

export async function listEchoMessages(
  pool: pg.Pool,
  channelId: string,
  opts: { before?: string; limit: number },
  diag?: {
    onTiming?: (t: {
      channelId: string;
      before: string | null;
      limit: number;
      messageCount: number;
      queryMs: number;
      pollMs: number;
      reactionsMs: number;
      authorsMs: number;
      totalMs: number;
    }) => void;
  },
): Promise<EchoMessageRow[]> {
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const hasE2ee = await echoMessagesTableHasE2eeColumns(pool);
  const selectFields = selectEchoMessageRowSqlFields(hasE2ee);
  const t0 = process.hrtime.bigint();
  if (opts.before) {
    const tq0 = process.hrtime.bigint();
    const r = await pool.query(
      `
      SELECT ${selectFields}
      FROM echo_messages
      WHERE channel_id = $1 AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM echo_messages anchor
          WHERE anchor.id = $2 AND anchor.channel_id = $1 AND anchor.deleted_at IS NULL
        )
        AND (${echoMessageIdPgGreaterThan('$2', 'id')})
      ORDER BY ${ECHO_MESSAGE_TIMELINE_ORDER_DESC}
      LIMIT $3
      `,
      [channelId, opts.before, limit],
    );
    const tq1 = process.hrtime.bigint();
    const drafts = mapMsgRowsDraft(r.rows).reverse();
    const enriched = await enrichEchoMessageDraftsParallel(pool, drafts);
    const labeled = enriched.rows;
    const t1 = process.hrtime.bigint();
    diag?.onTiming?.({
      channelId,
      before: opts.before,
      limit,
      messageCount: labeled.length,
      queryMs: Number(tq1 - tq0) / 1e6,
      pollMs: enriched.pollMs,
      reactionsMs: enriched.reactionsMs,
      authorsMs: enriched.authorsMs,
      totalMs: Number(t1 - t0) / 1e6,
    });
    return labeled;
  }
  const tq0 = process.hrtime.bigint();
  const r = await pool.query(
    `
    SELECT ${selectFields}
    FROM echo_messages
    WHERE channel_id = $1 AND deleted_at IS NULL
    ORDER BY ${ECHO_MESSAGE_TIMELINE_ORDER_DESC}
    LIMIT $2
    `,
    [channelId, limit],
  );
  const tq1 = process.hrtime.bigint();
  const drafts = mapMsgRowsDraft(r.rows).reverse();
  const enriched = await enrichEchoMessageDraftsParallel(pool, drafts);
  const labeled = enriched.rows;
  const t1 = process.hrtime.bigint();
  diag?.onTiming?.({
    channelId,
    before: null,
    limit,
    messageCount: labeled.length,
    queryMs: Number(tq1 - tq0) / 1e6,
    pollMs: enriched.pollMs,
    reactionsMs: enriched.reactionsMs,
    authorsMs: enriched.authorsMs,
    totalMs: Number(t1 - t0) / 1e6,
  });
  return labeled;
}

export type EchoMessageSearchHasType =
  | 'image'
  | 'gif'
  | 'link'
  | 'video'
  | 'audio'
  | 'docs';

export type EchoMessageSearchOpts = {
  channelIds: string[];
  /** Case-insensitive substring; optional when hasType / authorId / mentionSubstr / channelId set */
  q?: string;
  authorId?: string;
  /** Restrict to one channel (must still be in channelIds) */
  channelId?: string;
  /** Substring matched inside content (e.g. @name) */
  mentionSubstr?: string;
  before?: string;
  limit: number;
  hasType?: EchoMessageSearchHasType;
  /** Non-empty `attachments` JSON array */
  hasAttachment?: boolean;
};

/** Escape `\`, `%`, `_` for PostgreSQL ILIKE with ESCAPE '\\'. */
export function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function sqlFragmentForHasType(hasType: EchoMessageSearchHasType): string {
  switch (hasType) {
    case 'video':
      return `(m.video_url IS NOT NULL AND TRIM(COALESCE(m.video_url, '')) <> '')`;
    case 'audio':
      return `(m.audio_url IS NOT NULL AND TRIM(COALESCE(m.audio_url, '')) <> '')`;
    case 'gif':
      return `(m.gif = true
        OR (m.image_url IS NOT NULL AND (LOWER(m.image_url) LIKE '%giphy%' OR LOWER(m.image_url) LIKE '%tenor%' OR LOWER(m.image_url) LIKE '%.gif%' OR LOWER(m.image_url) LIKE '%media.giphy%'))
        OR (m.stickers IS NOT NULL AND jsonb_typeof(m.stickers) = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(m.stickers) sticker
          WHERE sticker->>'format' = 'gif'
        ))
        OR (m.embeds IS NOT NULL AND jsonb_typeof(m.embeds) = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(m.embeds) embed
          WHERE COALESCE(embed->'image'->>'url', '') ILIKE '%media.tenor.%'
             OR COALESCE(embed->'image'->>'url', '') ILIKE '%media.giphy.%'
             OR COALESCE(embed->>'url', '') ILIKE '%tenor.com/view/%'
             OR COALESCE(embed->>'url', '') ILIKE '%giphy.com/gifs/%'
        )))`;
    case 'image':
      return `(
        (m.image_url IS NOT NULL AND TRIM(COALESCE(m.image_url, '')) <> '' AND COALESCE(m.gif, false) = false AND NOT (LOWER(m.image_url) LIKE '%giphy%' OR LOWER(m.image_url) LIKE '%.gif%' OR LOWER(m.image_url) LIKE '%media.giphy%'))
        OR (m.stickers IS NOT NULL AND jsonb_typeof(m.stickers) = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(m.stickers) sticker
          WHERE sticker->>'format' IN ('png', 'apng')
        ))
      )`;
    case 'link':
      return `(m.search_index_text ~* 'https?://')`;
    case 'docs':
      return `(m.attachments IS NOT NULL AND jsonb_typeof(m.attachments) = 'array' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(m.attachments) att
        WHERE (att->>'mimeType') ILIKE 'application/%'
           OR (att->>'mimeType') ILIKE '%pdf%'
           OR (att->>'mimeType') ILIKE '%document%'
      ))`;
    default:
      return 'TRUE';
  }
}

/**
 * Search messages visible only within the given channel id allow-list (caller must enforce membership).
 */
export async function searchEchoMessagesInChannels(
  pool: pg.Pool,
  opts: EchoMessageSearchOpts,
): Promise<EchoMessageRow[]> {
  const channelIds = opts.channelIds.filter(Boolean);
  if (channelIds.length === 0) return [];

  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const qTrim = opts.q?.trim() ?? '';
  const hasQ = qTrim.length > 0;
  const hasAuthor =
    typeof opts.authorId === 'string' && opts.authorId.trim().length > 0;
  const hasMention =
    typeof opts.mentionSubstr === 'string' &&
    opts.mentionSubstr.trim().length > 0;
  const hasChannel =
    typeof opts.channelId === 'string' && opts.channelId.trim().length > 0;
  const hasHasType = opts.hasType != null;
  const hasAttachment = opts.hasAttachment === true;

  if (
    !hasQ &&
    !hasAuthor &&
    !hasMention &&
    !hasChannel &&
    !hasHasType &&
    !hasAttachment
  ) {
    return [];
  }

  const conditions: string[] = [
    'm.channel_id = ANY($1::text[])',
    'm.deleted_at IS NULL',
  ];
  const params: unknown[] = [channelIds];
  let pi = 2;

  if (hasChannel) {
    conditions.push(`m.channel_id = $${pi}`);
    params.push(opts.channelId!.trim());
    pi += 1;
  }

  if (hasAuthor) {
    conditions.push(`m.author_id = $${pi}`);
    params.push(opts.authorId!.trim());
    pi += 1;
  }

  if (hasQ) {
    conditions.push(`m.search_index_text ILIKE $${pi} ESCAPE '\\'`);
    params.push(`%${escapeIlikePattern(qTrim)}%`);
    pi += 1;
  }

  if (hasMention) {
    const m = opts.mentionSubstr!.trim();
    const needle = m.startsWith('@') ? m : `@${m}`;
    conditions.push(`m.search_index_text ILIKE $${pi} ESCAPE '\\'`);
    params.push(`%${escapeIlikePattern(needle)}%`);
    pi += 1;
  }

  if (hasHasType) {
    conditions.push(sqlFragmentForHasType(opts.hasType!));
  }

  if (hasAttachment) {
    conditions.push(
      `(m.attachments IS NOT NULL AND jsonb_typeof(m.attachments) = 'array' AND jsonb_array_length(m.attachments) > 0)`,
    );
  }

  if (opts.before) {
    conditions.push(`(${echoMessageIdPgGreaterThan(`$${pi}`, 'm.id')})`);
    params.push(opts.before);
    pi += 1;
  }

  const sql = `
    SELECT m.id, m.channel_id, m.author_id, m.content, m.mentions, m.reply_to, m.embeds, m.poll,
           m.image_url, m.video_url, m.audio_url, m.gif, m.image_spoiler, m.attachments, m.stickers,
           m.created_at, m.edited_at,
           m.content_json, m.search_index_text, m.message_format_version, m.content_schema_version
    FROM echo_messages m
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.id DESC
    LIMIT $${pi}
  `;
  params.push(limit);

  const r = await pool.query(sql, params);
  const drafts = mapMsgRowsDraft(r.rows).reverse();
  const enriched = await enrichEchoMessageDraftsParallel(pool, drafts);
  return enriched.rows;
}

export async function selectEchoMessageAuthorDeleted(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
): Promise<{
  authorId: string;
  deleted: boolean;
  messageFormatVersion: number;
} | null> {
  const q = await pool.query(
    `SELECT author_id, deleted_at, message_format_version FROM echo_messages WHERE id = $1 AND channel_id = $2`,
    [messageId, channelId],
  );
  if (!q.rows[0]) return null;
  const mf =
    q.rows[0].message_format_version != null
      ? Number(q.rows[0].message_format_version)
      : 1;
  return {
    authorId: String(q.rows[0].author_id),
    deleted: q.rows[0].deleted_at != null,
    messageFormatVersion: mf,
  };
}

export async function updateEchoMessageContentSql(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  content: string,
  attachments?: MessageAttachmentPayload[] | null,
): Promise<void> {
  if (attachments !== undefined) {
    await pool.query(
      `UPDATE echo_messages SET content = $3, search_index_text = $3, edited_at = NOW(), embeds = NULL,
       attachments = $4::jsonb,
       image_url = NULL, video_url = NULL, audio_url = NULL, gif = FALSE, image_spoiler = FALSE
       WHERE id = $1 AND channel_id = $2`,
      [messageId, channelId, content, JSON.stringify(attachments)],
    );
    return;
  }
  await pool.query(
    `UPDATE echo_messages SET content = $3, search_index_text = $3, edited_at = NOW(), embeds = NULL
     WHERE id = $1 AND channel_id = $2`,
    [messageId, channelId, content],
  );
}

/** Full body update for JSON messages (v2). */
export async function updateEchoMessageBodyJsonSql(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  args: {
    content: string;
    contentJson: unknown;
    searchIndexText: string;
    mentions: unknown;
    messageFormatVersion: number;
    contentSchemaVersion: number;
    attachments?: MessageAttachmentPayload[] | null;
  },
): Promise<void> {
  if (args.attachments !== undefined) {
    await pool.query(
      `UPDATE echo_messages SET
      content = $3,
      content_json = $4::jsonb,
      search_index_text = $5,
      mentions = $6::jsonb,
      message_format_version = $7,
      content_schema_version = $8,
      edited_at = NOW(),
      embeds = NULL,
      attachments = $9::jsonb,
      image_url = NULL, video_url = NULL, audio_url = NULL, gif = FALSE, image_spoiler = FALSE
     WHERE id = $1 AND channel_id = $2`,
      [
        messageId,
        channelId,
        args.content,
        JSON.stringify(args.contentJson),
        args.searchIndexText,
        JSON.stringify(args.mentions),
        args.messageFormatVersion,
        args.contentSchemaVersion,
        JSON.stringify(args.attachments),
      ],
    );
    return;
  }
  await pool.query(
    `UPDATE echo_messages SET
      content = $3,
      content_json = $4::jsonb,
      search_index_text = $5,
      mentions = $6::jsonb,
      message_format_version = $7,
      content_schema_version = $8,
      edited_at = NOW(),
      embeds = NULL
     WHERE id = $1 AND channel_id = $2`,
    [
      messageId,
      channelId,
      args.content,
      JSON.stringify(args.contentJson),
      args.searchIndexText,
      JSON.stringify(args.mentions),
      args.messageFormatVersion,
      args.contentSchemaVersion,
    ],
  );
}

export async function updateEchoMessageEmbeds(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  embeds: unknown,
): Promise<void> {
  await pool.query(
    `UPDATE echo_messages SET embeds = $1::jsonb WHERE id = $2 AND channel_id = $3 AND deleted_at IS NULL`,
    [JSON.stringify(embeds ?? null), messageId, channelId],
  );
}

/**
 * Rewrite imported Discord CDN URLs to Echo-hosted URLs. Does not touch `edited_at` or message body text.
 */
export async function updateEchoMessageDiscordImportMirroredMedia(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
  row: {
    attachments?: MessageAttachmentPayload[];
    stickers?: MessageStickerPayload[];
    embeds?: Embed[];
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    forwardedFrom?: ForwardedFrom;
    replyTo?: ReplyTo;
  },
): Promise<void> {
  const attachmentsJson =
    row.attachments && row.attachments.length > 0
      ? JSON.stringify(row.attachments)
      : null;
  const stickersJson =
    row.stickers && row.stickers.length > 0
      ? JSON.stringify(row.stickers)
      : null;
  const embedsJson =
    row.embeds && row.embeds.length > 0 ? JSON.stringify(row.embeds) : null;
  const fwdJson = row.forwardedFrom ? JSON.stringify(row.forwardedFrom) : null;
  const replyJson = row.replyTo ? JSON.stringify(row.replyTo) : null;
  await pool.query(
    `UPDATE echo_messages SET
      attachments = $3::jsonb,
      stickers = $4::jsonb,
      embeds = $5::jsonb,
      image_url = $6,
      video_url = $7,
      audio_url = $8,
      forward_of = $9::jsonb,
      reply_to = $10::jsonb
     WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL`,
    [
      messageId,
      channelId,
      attachmentsJson,
      stickersJson,
      embedsJson,
      row.imageUrl?.trim() || null,
      row.videoUrl?.trim() || null,
      row.audioUrl?.trim() || null,
      fwdJson,
      replyJson,
    ],
  );
}

export async function softDeleteEchoMessageSql(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_messages SET deleted_at = NOW() WHERE id = $1 AND channel_id = $2`,
    [messageId, channelId],
  );
}

export async function getEchoMessageCreatedAtById(
  pool: pg.Pool,
  messageId: string,
): Promise<Date | null> {
  const q = await pool.query(
    `SELECT created_at FROM echo_messages WHERE id = $1`,
    [messageId],
  );
  const row = q.rows[0];
  if (!row?.created_at) return null;
  const c = row.created_at;
  return c instanceof Date ? c : new Date(c as string);
}

/** Latest visible row for author; `created_at` used only for wall-clock slowmode interval (not feed order). */
export async function selectLastAuthorMessageCreatedAtForSlowmode(
  pool: pg.Pool,
  channelId: string,
  authorId: string,
): Promise<Date | null> {
  const last = await pool.query(
    `
    SELECT created_at FROM echo_messages
    WHERE channel_id = $1 AND author_id = $2 AND deleted_at IS NULL
    ORDER BY ${ECHO_MESSAGE_TIMELINE_ORDER_DESC} LIMIT 1
    `,
    [channelId, authorId],
  );
  const row = last.rows[0];
  if (!row?.created_at) return null;
  const c = row.created_at;
  return c instanceof Date ? c : new Date(c as string);
}

export async function reattributeEchoMessagesAuthorFromShadow(
  pool: pg.Pool,
  canonicalUserId: string,
  shadowId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_messages SET author_id = $1 WHERE author_id = $2`,
    [canonicalUserId, shadowId],
  );
}

export async function countEchoMessagesForServerChannels(
  pool: pg.Pool,
  serverId: string,
): Promise<number> {
  const messages = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM echo_messages m
     INNER JOIN echo_channels ch ON ch.id = m.channel_id
     WHERE ch.server_id = $1`,
    [serverId],
  );
  return Number(messages.rows[0]?.count ?? 0);
}

const BAN_PURGE_MESSAGES_MAX_ROWS = 10_000;

/**
 * Soft-delete recent messages from {@link authorId} across all text-bearing channels
 * in {@link serverId} with {@link createdAtOrAfter} (inclusive). Used when banning with
 * “delete recent messages” (compact spam cleanup).
 */
export async function bulkSoftDeleteEchoMessagesForAuthorInServerSince(
  pool: pg.Pool,
  serverId: string,
  authorId: string,
  createdAtOrAfter: Date,
): Promise<Array<{ messageId: string; channelId: string }>> {
  const q = await pool.query<{ id: string; channel_id: string }>(
    `
    WITH targets AS (
      SELECT m.id, m.channel_id
      FROM echo_messages m
      INNER JOIN echo_channels ch ON ch.id = m.channel_id
      WHERE ch.server_id = $1
        AND m.author_id = $2
        AND m.deleted_at IS NULL
        AND m.created_at >= $3::timestamptz
      LIMIT $4
    )
    UPDATE echo_messages m
    SET deleted_at = NOW()
    FROM targets t
    WHERE m.id = t.id AND m.channel_id = t.channel_id
    RETURNING m.id AS id, m.channel_id AS channel_id
    `,
    [serverId, authorId, createdAtOrAfter, BAN_PURGE_MESSAGES_MAX_ROWS],
  );
  return q.rows.map((row) => ({
    messageId: String(row.id),
    channelId: String(row.channel_id),
  }));
}

const AUTOMOD_CHANNEL_PURGE_MAX_ROWS = 100;

/**
 * Soft-delete recent messages from {@link authorId} in a single channel since
 * {@link createdAtOrAfter}, excluding pinned messages. Used by AutoMod
 * `delete_recent_messages` (must-succeed post-send).
 */
export async function bulkSoftDeleteEchoMessagesForAuthorInChannelSinceExcludePins(
  pool: pg.Pool,
  channelId: string,
  authorId: string,
  createdAtOrAfter: Date,
  maxRows: number = AUTOMOD_CHANNEL_PURGE_MAX_ROWS,
): Promise<Array<{ messageId: string; channelId: string }>> {
  const cap = Math.min(
    AUTOMOD_CHANNEL_PURGE_MAX_ROWS,
    Math.max(1, Math.floor(maxRows)),
  );
  const q = await pool.query<{ id: string; channel_id: string }>(
    `
    WITH pinned AS (
      SELECT message_id FROM echo_channel_pins WHERE channel_id = $1
    ),
    targets AS (
      SELECT m.id, m.channel_id
      FROM echo_messages m
      WHERE m.channel_id = $1
        AND m.author_id = $2
        AND m.deleted_at IS NULL
        AND m.created_at >= $3::timestamptz
        AND NOT EXISTS (SELECT 1 FROM pinned p WHERE p.message_id = m.id)
      ORDER BY m.id ASC
      LIMIT $4
    )
    UPDATE echo_messages m
    SET deleted_at = NOW()
    FROM targets t
    WHERE m.id = t.id AND m.channel_id = t.channel_id
    RETURNING m.id AS id, m.channel_id AS channel_id
    `,
    [channelId, authorId, createdAtOrAfter, cap],
  );
  return q.rows.map((row) => ({
    messageId: String(row.id),
    channelId: String(row.channel_id),
  }));
}

export async function countEchoMessagesInChannel(
  pool: pg.Pool,
  channelId: string,
): Promise<number> {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM echo_messages WHERE channel_id = $1`,
    [channelId],
  );
  return Number(countRes.rows[0]?.count ?? 0);
}

export async function listEchoMessageIdsInChannel(
  pool: pg.Pool,
  channelId: string,
): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM echo_messages WHERE channel_id = $1 AND deleted_at IS NULL`,
    [channelId],
  );
  return r.rows.map((row) => row.id);
}

export type EchoMessageSafetySnapshotRow = {
  authorId: string;
  content: string | null;
  searchIndexText: string | null;
  attachments: unknown;
  deletedAt: Date | null;
};

/** Minimal row for abuse reports (includes soft-deleted messages). */
export async function selectEchoMessageSafetySnapshotByChannel(
  pool: pg.Pool,
  channelId: string,
  messageId: string,
): Promise<EchoMessageSafetySnapshotRow | null> {
  const q = await pool.query<{
    author_id: string;
    content: string | null;
    search_index_text: string | null;
    attachments: unknown;
    deleted_at: Date | null;
  }>(
    `
    SELECT author_id, content, search_index_text, attachments, deleted_at
    FROM echo_messages
    WHERE id = $1 AND channel_id = $2
    `,
    [messageId, channelId],
  );
  const row = q.rows[0];
  if (!row) return null;
  return {
    authorId: String(row.author_id),
    content: row.content,
    searchIndexText: row.search_index_text,
    attachments: row.attachments,
    deletedAt: row.deleted_at,
  };
}

export async function updateEchoMessageCreatedAtById(
  pool: pg.Pool,
  messageId: string,
  createdAt: string | Date,
): Promise<void> {
  await pool.query(`UPDATE echo_messages SET created_at = $1 WHERE id = $2`, [
    createdAt,
    messageId,
  ]);
}

export type EchoDmThreadListRow = {
  channelId: string;
  peerId: string | null;
  kind: 'direct' | 'group';
  name: string | null;
  memberUserIds: string[] | null;
  lastActivityId: string;
  /** Authoritative inbox sort key. ISO 8601 UTC. */
  lastActivityAt: string;
  /** Custom group icon URL/key (echo_channels.icon_key); direct threads omit. */
  groupPfp: string | null;
};

/**
 * DM threads visible to `userId`, ordered by **`echo_dm_activity.last_activity_at` DESC**.
 *
 * Ordering invariants:
 * - The only sort key is `last_activity_at`. Snowflakes are NOT used to break recency ties.
 * - For channels that somehow lack an activity row (defensive fallback only), we fall back
 *   to channel `created_at` so they sort to roughly the bottom rather than dropping.
 * - All real activity (message persisted, DM call signaled, friend accepted between the pair,
 *   group event) bumps `last_activity_at` via {@link bumpEchoDmThreadActivity}.
 */
export async function queryEchoDmThreadsForUser(
  pool: pg.Pool,
  userId: string,
): Promise<EchoDmThreadListRow[]> {
  const r = await pool.query(
    `
    WITH scoped_channels AS (
      SELECT d.channel_id
      FROM echo_dm_threads d
      LEFT JOIN echo_dm_message_requests mr ON mr.channel_id = d.channel_id
      WHERE (d.user_low = $1 OR d.user_high = $1)
        AND (
          mr.channel_id IS NULL
          OR mr.status = 'accepted'
          OR (mr.status = 'pending' AND mr.requester_user_id = $1)
        )
      UNION
      SELECT g.channel_id
      FROM echo_group_dm_members g
      WHERE g.user_id = $1
    ),
    last_msg AS (
      SELECT m.channel_id, MAX(m.id) AS mid
      FROM echo_messages m
      WHERE m.deleted_at IS NULL
        AND m.channel_id IN (SELECT channel_id FROM scoped_channels)
      GROUP BY m.channel_id
    ),
    direct AS (
      SELECT
        d.channel_id,
        CASE WHEN d.user_low = $1 THEN d.user_high ELSE d.user_low END AS peer_id,
        'direct'::text AS kind,
        COALESCE(l.mid, d.channel_id) AS sort_key,
        COALESCE(act.last_activity_at, ch.created_at) AS last_activity_at,
        NULL::text AS group_name,
        NULL::text[] AS member_ids,
        NULL::text AS group_pfp
      FROM echo_dm_threads d
      INNER JOIN echo_channels ch ON ch.id = d.channel_id
      LEFT JOIN last_msg l ON l.channel_id = d.channel_id
      LEFT JOIN echo_dm_activity act ON act.channel_id = d.channel_id
      LEFT JOIN echo_dm_message_requests mr ON mr.channel_id = d.channel_id
      WHERE (d.user_low = $1 OR d.user_high = $1)
        AND (
          mr.channel_id IS NULL
          OR mr.status = 'accepted'
          OR (mr.status = 'pending' AND mr.requester_user_id = $1)
        )
    ),
    grp AS (
      SELECT
        g.channel_id,
        NULL::text AS peer_id,
        'group'::text AS kind,
        COALESCE(l.mid, g.channel_id) AS sort_key,
        COALESCE(act.last_activity_at, ch.created_at) AS last_activity_at,
        ch.name AS group_name,
        ARRAY(
          SELECT gm.user_id FROM echo_group_dm_members gm
          WHERE gm.channel_id = g.channel_id
          ORDER BY gm.user_id
        ) AS member_ids,
        NULLIF(BTRIM(ch.icon_key), '') AS group_pfp
      FROM echo_group_dm_members g
      INNER JOIN echo_channels ch ON ch.id = g.channel_id
      LEFT JOIN last_msg l ON l.channel_id = g.channel_id
      LEFT JOIN echo_dm_activity act ON act.channel_id = g.channel_id
      WHERE g.user_id = $1
    )
    SELECT channel_id, peer_id, kind, sort_key, last_activity_at, group_name, member_ids, group_pfp
    FROM (
      SELECT * FROM direct
      UNION ALL
      SELECT * FROM grp
    ) u
    ORDER BY last_activity_at DESC, sort_key DESC
    `,
    [userId],
  );
  return r.rows.map((row: Record<string, unknown>) => {
    const kind = String(row.kind) === 'group' ? 'group' : 'direct';
    const memberIdsRaw = row.member_ids;
    const memberUserIds = Array.isArray(memberIdsRaw)
      ? memberIdsRaw.map((x) => String(x))
      : null;
    const groupPfpRaw = row.group_pfp;
    const groupPfp =
      kind === 'group' && groupPfpRaw != null && String(groupPfpRaw).trim()
        ? String(groupPfpRaw).trim()
        : null;
    const rawActivityAt = row.last_activity_at;
    const lastActivityAt =
      rawActivityAt instanceof Date
        ? rawActivityAt.toISOString()
        : rawActivityAt
          ? new Date(String(rawActivityAt)).toISOString()
          : new Date(0).toISOString();
    return {
      channelId: String(row.channel_id),
      peerId: row.peer_id != null ? String(row.peer_id) : null,
      kind,
      name: row.group_name != null ? String(row.group_name) : null,
      memberUserIds: kind === 'group' ? memberUserIds : null,
      lastActivityId: String(row.sort_key),
      lastActivityAt,
      groupPfp,
    };
  });
}

/** Debug-only stats for GET /channels/:id/messages logging. */
export async function selectEchoMessagesChannelListDebugStats(
  pool: pg.Pool,
  channelId: string,
): Promise<{
  totalCount: number;
  liveCount: number;
  newestId: string | null;
  oldestId: string | null;
}> {
  const debugPre = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS live_count,
      MAX(id) AS newest_id,
      MIN(id) AS oldest_id
    FROM echo_messages
    WHERE channel_id = $1
    `,
    [channelId],
  );
  const row = debugPre.rows[0] as Record<string, unknown> | undefined;
  return {
    totalCount: Number(row?.total_count ?? 0),
    liveCount: Number(row?.live_count ?? 0),
    newestId: row?.newest_id != null ? String(row.newest_id) : null,
    oldestId: row?.oldest_id != null ? String(row.oldest_id) : null,
  };
}

/** Debug anchor row (includes soft-deleted) for list messages logging. */
export async function selectEchoMessageAnchorRowForListDebug(
  pool: pg.Pool,
  messageId: string,
): Promise<{ id: string; channelId: string; deleted: boolean } | null> {
  const beforeAnchor = await pool.query(
    `
    SELECT id, channel_id, deleted_at
    FROM echo_messages
    WHERE id = $1
    LIMIT 1
    `,
    [messageId],
  );
  const row = beforeAnchor.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    deleted: row.deleted_at != null,
  };
}

export async function selectUnreadEchoMessagesForAttention(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
): Promise<Record<string, unknown>[]> {
  if (channelIds.length === 0) return [];
  const mIdAfterReadTieBreak = echoMessageIdPgGreaterThan(
    'm.id',
    'rs.last_read_message_id',
  );
  const mAfterRead = `(
    lr.id IS NULL
    OR m.created_at > lr.created_at
    OR (m.created_at = lr.created_at AND ${mIdAfterReadTieBreak})
  )`;
  const unreadRows = await pool.query(
    `
    SELECT
      m.channel_id,
      m.id,
      m.created_at,
      m.mentions,
      ch.server_id
    FROM echo_messages m
    INNER JOIN echo_channels ch ON ch.id = m.channel_id
    LEFT JOIN echo_channel_read_state rs
      ON rs.user_id = $1
     AND rs.channel_id = m.channel_id
    LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
    WHERE m.channel_id = ANY($2::text[])
      AND m.deleted_at IS NULL
      AND m.author_id <> $1
      AND (
        rs.last_read_message_id IS NULL
        OR ${mAfterRead}
      )
    ORDER BY m.channel_id ASC, m.id DESC
    `,
    [userId, channelIds],
  );
  return unreadRows.rows as Record<string, unknown>[];
}

/** Per-channel unread aggregate returned by {@link selectUnreadAttentionAggregatesByChannel}. */
export type UnreadAttentionAggregate = {
  channel_id: string;
  server_id: string;
  unread_count: number;
  first_unread_message_id: string | null;
  first_unread_created_at: string | null;
  latest_unread_message_id: string | null;
  latest_unread_created_at: string | null;
};

/**
 * Per-channel unread counts + boundary IDs using SQL aggregation instead of
 * fetching every unread row.  Caps reported count at 200 per channel so the
 * query stays bounded.
 */
export async function selectUnreadAttentionAggregatesByChannel(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
): Promise<UnreadAttentionAggregate[]> {
  if (channelIds.length === 0) return [];
  const mIdAfterReadTieBreak = echoMessageIdPgGreaterThan(
    'm.id',
    'rs.last_read_message_id',
  );
  const mAfterRead = `(
    lr.id IS NULL
    OR m.created_at > lr.created_at
    OR (m.created_at = lr.created_at AND ${mIdAfterReadTieBreak})
  )`;
  // Isolated fragment: references only the `unread` CTE, not echo_messages directly.
  // Kept separate so the echo_messages segment above never contains ORDER BY ... created_at.
  const firstsLastsCtes = `
    firsts AS (
      SELECT DISTINCT ON (channel_id)
        channel_id,
        id AS first_unread_message_id,
        created_at AS first_unread_created_at
      FROM unread
      ORDER BY channel_id, id ASC
    ),
    lasts AS (
      SELECT DISTINCT ON (channel_id)
        channel_id,
        id AS latest_unread_message_id,
        created_at AS latest_unread_created_at
      FROM unread
      ORDER BY channel_id, id DESC
    )`;
  const r = await pool.query(
    `
    WITH unread AS (
      SELECT
        m.channel_id,
        ch.server_id,
        m.id,
        m.created_at
      FROM echo_messages m
      INNER JOIN echo_channels ch ON ch.id = m.channel_id
      LEFT JOIN echo_channel_read_state rs
        ON rs.user_id = $1
       AND rs.channel_id = m.channel_id
      LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
      WHERE m.channel_id = ANY($2::text[])
        AND m.deleted_at IS NULL
        AND m.author_id <> $1
        AND (
          rs.last_read_message_id IS NULL
          OR ${mAfterRead}
        )
    ),
    ${firstsLastsCtes}
    SELECT
      u.channel_id,
      u.server_id,
      LEAST(COUNT(*)::int, 200) AS unread_count,
      f.first_unread_message_id,
      f.first_unread_created_at,
      l.latest_unread_message_id,
      l.latest_unread_created_at
    FROM unread u
    INNER JOIN firsts f ON f.channel_id = u.channel_id
    INNER JOIN lasts l ON l.channel_id = u.channel_id
    GROUP BY
      u.channel_id,
      u.server_id,
      f.first_unread_message_id,
      f.first_unread_created_at,
      l.latest_unread_message_id,
      l.latest_unread_created_at
    `,
    [userId, channelIds],
  );
  return r.rows.map((row: any) => ({
    channel_id: String(row.channel_id),
    server_id: String(row.server_id ?? ''),
    unread_count: Number(row.unread_count ?? 0),
    first_unread_message_id: row.first_unread_message_id
      ? String(row.first_unread_message_id)
      : null,
    first_unread_created_at:
      row.first_unread_created_at instanceof Date
        ? row.first_unread_created_at.toISOString()
        : row.first_unread_created_at
          ? String(row.first_unread_created_at)
          : null,
    latest_unread_message_id: row.latest_unread_message_id
      ? String(row.latest_unread_message_id)
      : null,
    latest_unread_created_at:
      row.latest_unread_created_at instanceof Date
        ? row.latest_unread_created_at.toISOString()
        : row.latest_unread_created_at
          ? String(row.latest_unread_created_at)
          : null,
  }));
}

/**
 * Bounded scan for mention-bearing unread messages (for ping kind classification).
 * Only returns rows that have non-null, non-empty `mentions` JSONB — at most
 * {@link MENTION_SCAN_LIMIT} per call so the query stays bounded.
 */
const MENTION_SCAN_LIMIT = 500;

export async function selectUnreadMentionRowsForAttention(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
): Promise<{ channel_id: string; mentions: unknown }[]> {
  if (channelIds.length === 0) return [];
  const mIdAfterReadTieBreak = echoMessageIdPgGreaterThan(
    'm.id',
    'rs.last_read_message_id',
  );
  const mAfterRead = `(
    lr.id IS NULL
    OR m.created_at > lr.created_at
    OR (m.created_at = lr.created_at AND ${mIdAfterReadTieBreak})
  )`;
  const r = await pool.query(
    `
    SELECT m.channel_id, m.mentions
    FROM echo_messages m
    LEFT JOIN echo_channel_read_state rs
      ON rs.user_id = $1
     AND rs.channel_id = m.channel_id
    LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
    WHERE m.channel_id = ANY($2::text[])
      AND m.deleted_at IS NULL
      AND m.author_id <> $1
      AND m.mentions IS NOT NULL
      AND m.mentions <> '[]'::jsonb
      AND (
        rs.last_read_message_id IS NULL
        OR ${mAfterRead}
      )
    ORDER BY m.id DESC
    LIMIT ${MENTION_SCAN_LIMIT}
    `,
    [userId, channelIds],
  );
  return r.rows.map((row: any) => ({
    channel_id: String(row.channel_id),
    mentions: row.mentions,
  }));
}

/**
 * Bounded scan for unread replies to the viewer (personal ping tier).
 * Joins quoted parent when `reply_to.authorId` is absent (legacy rows).
 */
export async function selectUnreadReplyToSelfRowsForAttention(
  pool: pg.Pool,
  userId: string,
  channelIds: string[],
): Promise<{ channel_id: string }[]> {
  if (channelIds.length === 0) return [];
  const mIdAfterReadTieBreak = echoMessageIdPgGreaterThan(
    'm.id',
    'rs.last_read_message_id',
  );
  const mAfterRead = `(
    lr.id IS NULL
    OR m.created_at > lr.created_at
    OR (m.created_at = lr.created_at AND ${mIdAfterReadTieBreak})
  )`;
  const r = await pool.query(
    `
    SELECT DISTINCT m.channel_id
    FROM echo_messages m
    LEFT JOIN echo_channel_read_state rs
      ON rs.user_id = $1
     AND rs.channel_id = m.channel_id
    LEFT JOIN echo_messages lr ON lr.id = rs.last_read_message_id
    LEFT JOIN echo_messages parent
      ON parent.id = NULLIF(m.reply_to->>'messageId', '')
     AND parent.deleted_at IS NULL
    WHERE m.channel_id = ANY($2::text[])
      AND m.deleted_at IS NULL
      AND m.author_id <> $1
      AND m.reply_to IS NOT NULL
      AND m.reply_to <> 'null'::jsonb
      AND (
        NULLIF(m.reply_to->>'authorId', '') = $1
        OR parent.author_id = $1
      )
      AND (
        rs.last_read_message_id IS NULL
        OR ${mAfterRead}
      )
    ORDER BY m.channel_id
    LIMIT ${MENTION_SCAN_LIMIT}
    `,
    [userId, channelIds],
  );
  return r.rows.map((row: any) => ({
    channel_id: String(row.channel_id),
  }));
}

export async function selectEchoDmRealtimeDirectThreadRow(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<
  { peer_id: unknown; sort_key: unknown; last_activity_at: unknown } | undefined
> {
  const direct = await pool.query(
    `
    WITH last_msg AS (
      SELECT channel_id, MAX(id) AS mid
      FROM echo_messages
      WHERE channel_id = $1 AND deleted_at IS NULL
      GROUP BY channel_id
    )
    SELECT
      d.channel_id,
      CASE WHEN d.user_low = $2 THEN d.user_high ELSE d.user_low END AS peer_id,
      COALESCE(l.mid, d.channel_id) AS sort_key,
      COALESCE(act.last_activity_at, ch.created_at) AS last_activity_at
    FROM echo_dm_threads d
    INNER JOIN echo_channels ch ON ch.id = d.channel_id
    LEFT JOIN last_msg l ON l.channel_id = d.channel_id
    LEFT JOIN echo_dm_activity act ON act.channel_id = d.channel_id
    LEFT JOIN echo_dm_message_requests mr ON mr.channel_id = d.channel_id
    WHERE d.channel_id = $1
      AND (d.user_low = $2 OR d.user_high = $2)
      AND (
        mr.channel_id IS NULL
        OR mr.status = 'accepted'
        OR (mr.status = 'pending' AND mr.requester_user_id = $2)
      )
    LIMIT 1
    `,
    [channelId, userId],
  );
  return direct.rows[0] as
    | { peer_id: unknown; sort_key: unknown; last_activity_at: unknown }
    | undefined;
}

/**
 * Direct DM thread row for **call signaling** (`dm:call` socket events).
 * Unlike `selectEchoDmRealtimeDirectThreadRow`, this does not hide the thread from the
 * message-request **recipient** while a request is still `pending` — the callee must
 * receive `dm:call` and ring audio even before accepting the text DM.
 */
export async function selectEchoDmDirectThreadRowForCallSignal(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<
  { peer_id: unknown; sort_key: unknown; last_activity_at: unknown } | undefined
> {
  const r = await pool.query(
    `
    WITH last_msg AS (
      SELECT channel_id, MAX(id) AS mid
      FROM echo_messages
      WHERE channel_id = $1 AND deleted_at IS NULL
      GROUP BY channel_id
    )
    SELECT
      d.channel_id,
      CASE WHEN d.user_low = $2 THEN d.user_high ELSE d.user_low END AS peer_id,
      COALESCE(l.mid, d.channel_id) AS sort_key,
      COALESCE(act.last_activity_at, ch.created_at) AS last_activity_at
    FROM echo_dm_threads d
    INNER JOIN echo_channels ch ON ch.id = d.channel_id
    LEFT JOIN last_msg l ON l.channel_id = d.channel_id
    LEFT JOIN echo_dm_activity act ON act.channel_id = d.channel_id
    WHERE d.channel_id = $1
      AND (d.user_low = $2 OR d.user_high = $2)
    LIMIT 1
    `,
    [channelId, userId],
  );
  return r.rows[0] as
    | { peer_id: unknown; sort_key: unknown; last_activity_at: unknown }
    | undefined;
}

export async function selectEchoDmRealtimeGroupThreadRow(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<
  | {
      channel_id: unknown;
      group_name: unknown;
      sort_key: unknown;
      last_activity_at: unknown;
      group_icon_key: unknown;
      member_ids: unknown;
    }
  | undefined
> {
  const group = await pool.query(
    `
    WITH last_msg AS (
      SELECT channel_id, MAX(id) AS mid
      FROM echo_messages
      WHERE channel_id = $1 AND deleted_at IS NULL
      GROUP BY channel_id
    )
    SELECT
      ch.id AS channel_id,
      ch.name AS group_name,
      COALESCE(l.mid, ch.id) AS sort_key,
      COALESCE(act.last_activity_at, ch.created_at) AS last_activity_at,
      NULLIF(BTRIM(ch.icon_key), '') AS group_icon_key,
      ARRAY(
        SELECT gm_all.user_id
        FROM echo_group_dm_members gm_all
        WHERE gm_all.channel_id = ch.id
        ORDER BY gm_all.user_id
      ) AS member_ids
    FROM echo_group_dm_members gm
    INNER JOIN echo_channels ch ON ch.id = gm.channel_id
    LEFT JOIN last_msg l ON l.channel_id = ch.id
    LEFT JOIN echo_dm_activity act ON act.channel_id = ch.id
    WHERE gm.channel_id = $1
      AND gm.user_id = $2
    LIMIT 1
    `,
    [channelId, userId],
  );
  return group.rows[0] as
    | {
        channel_id: unknown;
        group_name: unknown;
        sort_key: unknown;
        last_activity_at: unknown;
        group_icon_key: unknown;
        member_ids: unknown;
      }
    | undefined;
}

export async function selectEchoDmMessageRequestsPendingPreviewRows(
  pool: pg.Pool,
  userId: string,
): Promise<
  Array<{
    channel_id: unknown;
    requester_user_id: unknown;
    preview: unknown;
  }>
> {
  const r = await pool.query(
    `
    WITH last_msg AS (
      SELECT DISTINCT ON (m.channel_id)
        m.channel_id,
        COALESCE(
          NULLIF(BTRIM(COALESCE(m.search_index_text, '')), ''),
          NULLIF(BTRIM(COALESCE(m.content, '')), '')
        ) AS preview,
        m.id AS message_id
      FROM echo_messages m
      WHERE m.deleted_at IS NULL
      ORDER BY m.channel_id, m.id DESC
    )
    SELECT
      mr.channel_id,
      mr.requester_user_id,
      COALESCE(NULLIF(BTRIM(COALESCE(lm.preview, '')), ''), 'New message request') AS preview
    FROM echo_dm_message_requests mr
    INNER JOIN last_msg lm ON lm.channel_id = mr.channel_id
    WHERE mr.recipient_user_id = $1
      AND mr.status = 'pending'
    ORDER BY lm.message_id DESC
    `,
    [userId],
  );
  return r.rows as Array<{
    channel_id: unknown;
    requester_user_id: unknown;
    preview: unknown;
  }>;
}

export async function countEchoMessagesAuthorBurstInServer(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  windowSeconds: number,
): Promise<number> {
  const burstRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM echo_messages m
    INNER JOIN echo_channels ch ON ch.id = m.channel_id
    WHERE ch.server_id = $1
      AND m.author_id = $2
      AND m.deleted_at IS NULL
      AND m.created_at >= NOW() - ($3::int * interval '1 second')
    `,
    [serverId, userId, windowSeconds],
  );
  return Number(burstRes.rows[0]?.count ?? 0);
}

export async function countEchoMessagesAuthorDuplicateInServer(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  windowSeconds: number,
  normalizedContent: string,
): Promise<number> {
  const duplicateRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM echo_messages m
    INNER JOIN echo_channels ch ON ch.id = m.channel_id
    WHERE ch.server_id = $1
      AND m.author_id = $2
      AND m.deleted_at IS NULL
      AND m.created_at >= NOW() - ($3::int * interval '1 second')
      AND lower(btrim(m.content)) = $4
    `,
    [serverId, userId, windowSeconds, normalizedContent],
  );
  return Number(duplicateRes.rows[0]?.count ?? 0);
}

/**
 * Upsert the read-state cursor for a user/channel pair.
 *
 * Lives here (not in echoStore/channelReadState.ts) because the conflict-resolution
 * subquery must reference echo_messages, and this is the only module allowed to do that.
 */
export async function upsertEchoChannelReadState(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  lastReadMessageId: string,
): Promise<'ok' | 'not_found' | 'validation'> {
  const mid = lastReadMessageId.trim();
  if (!mid) return 'validation';

  // Validate the anchor exists in this channel. Do not filter on `deleted_at`:
  // users may read past messages that were later soft-deleted.
  const anchor = await pool.query(
    `SELECT channel_id FROM echo_messages WHERE id = $1 LIMIT 1`,
    [mid],
  );
  const anchorRow = anchor.rows[0] as Record<string, unknown> | undefined;
  if (!anchorRow || String(anchorRow.channel_id) !== channelId) {
    return 'not_found';
  }

  const prevIdGtNewId = echoMessageIdPgGreaterThan(
    'echo_channel_read_state.last_read_message_id',
    'EXCLUDED.last_read_message_id',
  );
  await pool.query(
    `
    INSERT INTO echo_channel_read_state (user_id, channel_id, last_read_message_id, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id, channel_id) DO UPDATE SET
      last_read_message_id = COALESCE((
        SELECT
          CASE
            -- Missing current anchor: accept the new cursor.
            WHEN cur.id IS NULL THEN EXCLUDED.last_read_message_id
            -- Missing incoming anchor (should be rare due to validation): keep current cursor.
            WHEN inc.id IS NULL THEN echo_channel_read_state.last_read_message_id
            WHEN cur.created_at > inc.created_at THEN echo_channel_read_state.last_read_message_id
            WHEN cur.created_at < inc.created_at THEN EXCLUDED.last_read_message_id
            -- Tie-break: deterministic id ordering.
            WHEN ${prevIdGtNewId} THEN echo_channel_read_state.last_read_message_id
            ELSE EXCLUDED.last_read_message_id
          END
        FROM echo_messages inc
        LEFT JOIN echo_messages cur ON cur.id = echo_channel_read_state.last_read_message_id
        WHERE inc.id = EXCLUDED.last_read_message_id
        LIMIT 1
      ), EXCLUDED.last_read_message_id),
      updated_at = NOW()
    `,
    [userId, channelId, mid],
  );
  return 'ok';
}

/** Soft-delete messages older than channel TTL (auto-delete job). */
export async function softDeleteEchoMessagesOlderThanInChannel(
  pool: pg.Pool,
  channelId: string,
  olderThan: Date,
  limit: number,
): Promise<{ id: string; channelId: string }[]> {
  const cap = Math.min(Math.max(Math.floor(limit), 1), 5000);
  const r = await pool.query(
    `
    UPDATE echo_messages m
    SET deleted_at = NOW()
    WHERE m.id IN (
      SELECT id FROM echo_messages
      WHERE channel_id = $1
        AND deleted_at IS NULL
        AND created_at < $2
      ORDER BY id ASC
      LIMIT $3
    )
    RETURNING m.id, m.channel_id
    `,
    [channelId, olderThan, cap],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    channelId: String(row.channel_id),
  }));
}

/**
 * Physical purge after compliance retention (deleted_at set).
 * Rows remain queryable for {@link complianceDays} while soft-deleted.
 */
export async function purgeEchoMessagesDeletedBefore(
  pool: pg.Pool,
  deletedBefore: Date,
  limit: number,
): Promise<number> {
  const cap = Math.min(Math.max(Math.floor(limit), 1), 10_000);
  const r = await pool.query(
    `
    DELETE FROM echo_messages
    WHERE id IN (
      SELECT id FROM echo_messages
      WHERE deleted_at IS NOT NULL AND deleted_at < $1
      ORDER BY deleted_at ASC
      LIMIT $2
    )
    `,
    [deletedBefore, cap],
  );
  return r.rowCount ?? 0;
}
