import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type pg from 'pg';
import type { Embed, Message } from '../../../shared/types';
import { redactPollOnMessage } from '../../../shared/types';
import {
  ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID,
  ECHO_WEBHOOK_BRIDGE_SOURCE,
} from '../domain/echoChannelWebhookConstants';
import {
  getEchoChannelServerIdAndType,
  getEchoChannelWebhookById,
  isEchoChannelWebhookSupportedType,
  touchEchoChannelWebhookLastUsed,
  verifyEchoChannelWebhookToken,
} from '../domain/echoChannelWebhooksRepo';
import { getEchoMessageById, insertEchoMessage } from '../domain/echoMessagesDal';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { echoRowToMessage } from './echoPersistedMessageCreate';
import { filterMentionsForChannelContext } from '../domain/echoStore/mentionContext';
import { canUserSendMassMentionInChannel } from '../domain/echoStore/access';
import { checkEchoServerSpamFilter } from '../domain/echoStore/serverSpamFilter';
import { evaluateAutomodOnMessageSend } from '../domain/echoStore/automod/messageEval';
import {
  applyAutomodBlockDeliveries,
  recordAutomodBlockHits,
} from './echoAutomodApply';
import { validateEchoForumPostCreateFirstMessagePoll } from '../domain/echoStore/forums';
import { buildMentionEntitiesFromDiscordWebhookContent } from './echoChannelWebhookAllowedMentions';
import { normalizeWebhookExecutePoll } from './echoChannelWebhookPollDiscord';
import { resolveWebhookExecuteTargetChannel } from './echoChannelWebhookRouting';
import { persistWebhookInboundFiles } from './echoChannelWebhookInboundFiles';
import { serializeEchoRowForDiscordWebhookExecuteWait } from './discordWebhookExecuteSerialization';
import {
  DISCORD_MSG_FLAG_IS_COMPONENTS_V2,
  DISCORD_WEBHOOK_EXECUTE_CONTENT_MAX,
  WEBHOOK_EXECUTE_ALLOWED_MESSAGE_FLAGS_MASK,
  WEBHOOK_EXECUTE_MAX_COMPONENTS_JSON_BYTES,
} from './echoChannelWebhookExecuteConstants';

export type EchoChannelWebhookExecuteQuery = {
  wait?: boolean;
  threadId?: string | null;
  withComponents?: boolean;
};

function parseBoolQuery(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

export function parseEchoChannelWebhookExecuteQuery(
  raw: unknown,
): EchoChannelWebhookExecuteQuery {
  if (!raw || typeof raw !== 'object') return { withComponents: true };
  const q = raw as Record<string, unknown>;
  const wait = parseBoolQuery(q.wait);
  const withComponents = parseBoolQuery(q.with_components);
  const threadId =
    typeof q.thread_id === 'string' && q.thread_id.trim() ? q.thread_id.trim() : null;
  return {
    ...(wait !== undefined ? { wait } : {}),
    ...(threadId ? { threadId } : {}),
    withComponents: withComponents !== false,
  };
}

export function translateSlackIncomingWebhookBody(
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (b.blocks !== undefined || b.attachments !== undefined) {
    return null;
  }
  const text = typeof b.text === 'string' ? b.text : '';
  const out: Record<string, unknown> = {};
  if (text) out.content = text;
  if (typeof b.username === 'string' && b.username.trim()) {
    out.username = b.username.trim();
  }
  if (typeof b.icon_url === 'string' && b.icon_url.trim()) {
    out.avatar_url = b.icon_url.trim();
  }
  return Object.keys(out).length ? out : null;
}

export function translateGitHubWebhookBody(
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  let text = '';
  if (typeof b.body === 'string') text = b.body;
  else if (b.comment && typeof b.comment === 'object') {
    const c = (b.comment as { body?: unknown }).body;
    if (typeof c === 'string') text = c;
  } else if (b.issue && typeof b.issue === 'object') {
    const t = (b.issue as { title?: unknown }).title;
    if (typeof t === 'string') text = t;
  }
  if (!text.trim()) return null;
  return { content: text };
}

function clampComponentsJsonSize(raw: unknown): unknown | undefined {
  if (raw === undefined) return undefined;
  const s = JSON.stringify(raw);
  if (s.length > WEBHOOK_EXECUTE_MAX_COMPONENTS_JSON_BYTES) return undefined;
  return raw;
}

/**
 * Ingest POST from a channel incoming webhook URL (Discord-style execute).
 */
export async function executeEchoChannelWebhook(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  opts: {
    webhookId: string;
    plaintextToken: string;
    /** Merged JSON (+ multipart payload_json) body as a plain object. */
    body: Record<string, unknown> | null;
    multipartFiles?: { filename: string; buffer: Buffer; contentType?: string | null }[];
    query?: EchoChannelWebhookExecuteQuery;
    fastify?: FastifyInstance;
  },
): Promise<
  | {
      ok: true;
      message: Message;
      wait: boolean;
      discordWaitBody?: ReturnType<typeof serializeEchoRowForDiscordWebhookExecuteWait>;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const query = opts.query ?? { withComponents: true };
  const wait = query.wait === true;

  const webhookId = opts.webhookId.trim();
  if (!webhookId) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found.' };
  }

  const row = await getEchoChannelWebhookById(pool, webhookId);
  if (!row) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found.' };
  }
  if (!verifyEchoChannelWebhookToken(opts.plaintextToken, row.tokenHash)) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid webhook token.',
    };
  }

  const chMeta = await getEchoChannelServerIdAndType(pool, row.channelId);
  if (
    !chMeta ||
    chMeta.serverId !== row.serverId ||
    !isEchoChannelWebhookSupportedType(chMeta.type)
  ) {
    return {
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Webhook target channel is no longer valid.',
    };
  }

  const merged: Record<string, unknown> = { ...(opts.body ?? {}) };

  const contentRaw = typeof merged.content === 'string' ? merged.content : '';
  const contentTrim = contentRaw.trim().slice(0, DISCORD_WEBHOOK_EXECUTE_CONTENT_MAX);

  let username: string | undefined;
  if (typeof merged.username === 'string' && merged.username.trim()) {
    username = merged.username.trim().slice(0, 80);
  }
  let avatarUrl: string | undefined;
  if (typeof merged.avatar_url === 'string' && merged.avatar_url.trim()) {
    const u = merged.avatar_url.trim().slice(0, 2048);
    if (u.toLowerCase().startsWith('http://') || u.toLowerCase().startsWith('https://')) {
      avatarUrl = u;
    }
  }

  let embeds: Embed[] | undefined;
  if (Array.isArray(merged.embeds) && merged.embeds.length > 0) {
    embeds = merged.embeds.slice(0, 10) as Embed[];
  }

  const tts = merged.tts === true;

  let messageFlags: number | undefined;
  if (merged.flags != null && Number.isFinite(Number(merged.flags))) {
    const fl = Math.floor(Number(merged.flags));
    if (fl < 0 || (fl & ~WEBHOOK_EXECUTE_ALLOWED_MESSAGE_FLAGS_MASK) !== 0) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'Invalid message flags for webhook execute.',
      };
    }
    messageFlags = fl;
  }

  let components: unknown = clampComponentsJsonSize(merged.components);
  if (query.withComponents === false) {
    components = undefined;
  }
  if (components !== undefined && !Array.isArray(components)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      message: 'components must be an array.',
    };
  }

  const v2 = (messageFlags ?? 0) & DISCORD_MSG_FLAG_IS_COMPONENTS_V2;
  if (v2 !== 0) {
    if (contentTrim.length > 0 || (embeds && embeds.length > 0)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'IS_COMPONENTS_V2 cannot be combined with content or embeds.',
      };
    }
    if (!Array.isArray(components) || components.length === 0) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'IS_COMPONENTS_V2 requires non-empty components.',
      };
    }
  }

  const poll = normalizeWebhookExecutePoll(merged.poll);

  const threadName =
    typeof merged.thread_name === 'string' && merged.thread_name.trim()
      ? merged.thread_name.trim().slice(0, 100)
      : null;
  const appliedTags = merged.applied_tags;

  const route = await resolveWebhookExecuteTargetChannel({
    pool,
    serverId: row.serverId,
    webhookChannelId: row.channelId,
    webhookChannelType: chMeta.type,
    queryThreadId: query.threadId ?? null,
    bodyThreadName: threadName,
    bodyAppliedTags: appliedTags,
    contentForTitle: contentTrim || 'New post',
  });
  if (!route.ok) {
    return {
      ok: false,
      status: route.status,
      code: route.code,
      message: route.message,
    };
  }
  const targetChannelId = route.targetChannelId;

  if (route.createdForumPostChannelId) {
    const pollCheck = validateEchoForumPostCreateFirstMessagePoll(
      'poll' in merged ? merged.poll : undefined,
    );
    if (!pollCheck.ok) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: pollCheck.error,
      };
    }
  }

  const allowedMentions =
    merged.allowed_mentions && typeof merged.allowed_mentions === 'object'
      ? (merged.allowed_mentions as import('./echoChannelWebhookAllowedMentions').DiscordAllowedMentionsInput)
      : undefined;
  let mentions = buildMentionEntitiesFromDiscordWebhookContent(
    contentRaw,
    allowedMentions,
  );
  mentions = await filterMentionsForChannelContext(pool, targetChannelId, mentions);

  const permissionUserId = row.createdByUserId?.trim() || ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID;

  if (
    !(await canUserSendMassMentionInChannel(
      pool,
      permissionUserId,
      targetChannelId,
      mentions,
    ))
  ) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'You cannot mention @everyone or @active in this channel.',
    };
  }

  const spamCheck = await checkEchoServerSpamFilter(pool, {
    serverId: row.serverId,
    userId: permissionUserId,
    content: contentTrim,
    mentions,
  });
  if (!spamCheck.ok) {
    return {
      ok: false,
      status: 429,
      code: 'SPAM_FILTER',
      message: spamCheck.detail,
    };
  }

  const automodEval = await evaluateAutomodOnMessageSend(pool, {
    serverId: row.serverId,
    channelId: targetChannelId,
    userId: ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID,
    content: contentTrim,
    mentionCount: mentions?.length ?? 0,
  });
  if (automodEval.shouldBlock) {
    const own = await pool.query(
      `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
      [row.serverId],
    );
    const ownerActorId = own.rows[0] ? String(own.rows[0].owner_id) : '';
    if (ownerActorId) {
      await recordAutomodBlockHits(pool, {
        serverId: row.serverId,
        ownerActorId,
        channelId: targetChannelId,
        userId: ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID,
        correlationId: automodEval.correlationId,
        firedRules: automodEval.firedRules,
        log,
      });
      if (opts.fastify) {
        await applyAutomodBlockDeliveries(opts.fastify, pool, {
          serverId: row.serverId,
          ownerActorId,
          channelId: targetChannelId,
          userId: ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID,
          correlationId: automodEval.correlationId,
          firedRules: automodEval.firedRules,
          log,
        });
      }
    }
    return {
      ok: false,
      status: 403,
      code: 'AUTOMOD_BLOCKED',
      message: automodEval.blockUserDetail ?? 'Blocked by AutoMod',
    };
  }

  const files = opts.multipartFiles ?? [];
  const hasFiles = files.length > 0;
  const hasEmbeds = Boolean(embeds && embeds.length > 0);
  const hasComponents = Array.isArray(components) && components.length > 0;
  const hasPoll = Boolean(poll);
  if (!contentTrim && !hasEmbeds && !hasComponents && !hasFiles && !hasPoll) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      message: 'At least one of content, embeds, components, files, or poll is required.',
    };
  }

  if (hasPoll && hasFiles) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      message: 'poll cannot be combined with file attachments.',
    };
  }

  const messageId = nextEchoSnowflakeId();

  let attachments:
    | import('../../../shared/types').MessageAttachmentPayload[]
    | undefined;
  if (hasFiles) {
    const up = await persistWebhookInboundFiles({
      pool,
      serverId: row.serverId,
      channelId: targetChannelId,
      messageId,
      files,
      log,
    });
    if (!up.ok) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: up.message,
      };
    }
    attachments = up.attachments;
  }

  const webhookUsername =
    (username && username.trim()) || row.name.trim().slice(0, 80) || 'Webhook';
  const webhookAvatarUrlFinal =
    (avatarUrl && avatarUrl.trim()) ||
    (row.avatarUrl && row.avatarUrl.trim()) ||
    null;

  let ins: 'inserted' | 'duplicate';
  try {
    ins = await insertEchoMessage(pool, {
      id: messageId,
      channelId: targetChannelId,
      authorId: ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID,
      content: contentTrim,
      ...(embeds && embeds.length > 0 ? { embeds } : {}),
      ...(mentions?.length ? { mentions } : {}),
      ...(poll ? { poll } : {}),
      ...(attachments && attachments.length ? { attachments } : {}),
      bridgeSource: ECHO_WEBHOOK_BRIDGE_SOURCE,
      sourceWebhookId: row.id,
      webhookUsername,
      webhookAvatarUrl: webhookAvatarUrlFinal,
      tts,
      ...(messageFlags !== undefined ? { messageFlags } : {}),
      ...(components !== undefined ? { components } : {}),
    });
  } catch (e) {
    log.error({ err: e, msg: 'echo_channel_webhook.insert_failed' }, 'Webhook insert failed');
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL',
      message: 'Failed to store message.',
    };
  }

  if (ins !== 'inserted') {
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL',
      message: 'Message insert conflict.',
    };
  }

  await touchEchoChannelWebhookLastUsed(pool, row.id);
  echoMessagesPersistedTotal.inc({ result: 'inserted' });

  const loaded = await getEchoMessageById(pool, messageId);
  if (!loaded) {
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL',
      message: 'Failed to load message.',
    };
  }

  const message = echoRowToMessage(loaded);
  const forClients = redactPollOnMessage(
    message,
    ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID,
  );

  if (io) {
    log.info(
      {
        msg: 'echo_channel_webhook.broadcast',
        channelId: targetChannelId,
        messageId,
        webhookId: row.id,
      },
      'Broadcast channel webhook message',
    );
    broadcastToEchoChannel(io, targetChannelId, 'message', forClients);
  }

  const discordWaitBody = wait
    ? serializeEchoRowForDiscordWebhookExecuteWait(loaded)
    : undefined;

  return {
    ok: true,
    message: forClients,
    wait,
    ...(discordWaitBody ? { discordWaitBody } : {}),
  };
}
