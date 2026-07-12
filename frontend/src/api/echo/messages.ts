import {
  buildEchoMessageSearchQueryString,
  type EchoMessageSearchQueryInput,
} from '@/api/echoSearchParams';
import type {
  EchoReadStatePutResponse,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageReaction,
  MessageStickerPayload,
  PollData,
} from '@shared/types';
import { echoFetch, trimEchoPathSegment } from './transport';

/** Structural checks at the HTTP trust boundary (row 16); per-field semantics stay in domain / callers. */
function assertEchoJsonObject(
  data: unknown,
  context: string,
): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${context}: expected JSON object`);
  }
  return data as Record<string, unknown>;
}

function parseEchoMessagesListPayload(
  data: unknown,
  context: string,
): { messages: EchoApiMessage[] } {
  const o = assertEchoJsonObject(data, context);
  if (!Array.isArray(o.messages)) {
    throw new Error(`${context}: expected "messages" array`);
  }
  return { messages: o.messages as EchoApiMessage[] };
}

function parseEchoSingleMessagePayload(
  data: unknown,
  context: string,
): { message: EchoApiMessage } {
  const o = assertEchoJsonObject(data, context);
  if (!o.message || typeof o.message !== 'object' || Array.isArray(o.message)) {
    throw new Error(`${context}: expected "message" object`);
  }
  return { message: o.message as EchoApiMessage };
}

function parseEchoPostChannelMessageResponse(
  data: unknown,
  context: string,
): { message: EchoApiMessage; idempotentReplay?: boolean } {
  const o = assertEchoJsonObject(data, context);
  if (!o.message || typeof o.message !== 'object' || Array.isArray(o.message)) {
    throw new Error(`${context}: expected "message" object`);
  }
  return {
    message: o.message as EchoApiMessage,
    ...(o.idempotentReplay === true ? { idempotentReplay: true as const } : {}),
  };
}

function parseEchoChannelPinsPayload(
  data: unknown,
  context: string,
): { messageIds: string[] } {
  const o = assertEchoJsonObject(data, context);
  if (!Array.isArray(o.messageIds)) {
    throw new Error(`${context}: expected "messageIds" array`);
  }
  const messageIds = o.messageIds.filter(
    (id): id is string => typeof id === 'string',
  );
  return { messageIds };
}

export type EchoApiMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  authorIsDiscordShadow?: boolean;
  authorDiscordUserId?: string;
  bridgeFromDiscord?: boolean;
  content: string;
  /** REST rows may expose DB `search_index_text` under this name. */
  searchIndexText?: string;
  contentText?: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
  contentSchemaVersion?: number;
  mentions?: unknown;
  replyTo?: unknown;
  embeds?: unknown;
  poll?: PollData;
  timestamp: string;
  editedAt?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  reactions?: MessageReaction[];
  forwardedFrom?: ForwardedFrom;
};

export async function fetchEchoChannelMessages(
  token: string,
  channelId: string,
  opts?: { before?: string; limit?: number; signal?: AbortSignal },
): Promise<{ messages: EchoApiMessage[] }> {
  const ch = trimEchoPathSegment(channelId);
  const q = new URLSearchParams();
  if (opts?.before) q.set('before', trimEchoPathSegment(opts.before));
  if (opts?.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  const raw = await echoFetch<unknown>(
    token,
    `/channels/${encodeURIComponent(ch)}/messages${qs ? `?${qs}` : ''}`,
    { signal: opts?.signal },
  );
  return parseEchoMessagesListPayload(raw, 'GET /channels/.../messages');
}

export async function fetchEchoChannelMessage(
  token: string,
  channelId: string,
  messageId: string,
): Promise<{ message: EchoApiMessage }> {
  const ch = trimEchoPathSegment(channelId);
  const mid = trimEchoPathSegment(messageId);
  const raw = await echoFetch<unknown>(
    token,
    `/channels/${encodeURIComponent(ch)}/messages/${encodeURIComponent(mid)}`,
  );
  return parseEchoSingleMessagePayload(
    raw,
    'GET /channels/.../messages/:messageId',
  );
}

export async function fetchEchoChannelPins(
  token: string,
  channelId: string,
): Promise<{ messageIds: string[] }> {
  const ch = trimEchoPathSegment(channelId);
  const raw = await echoFetch<unknown>(
    token,
    `/channels/${encodeURIComponent(ch)}/pins`,
  );
  return parseEchoChannelPinsPayload(raw, 'GET /channels/.../pins');
}

export async function putEchoChannelReadState(
  token: string,
  channelId: string,
  lastReadMessageId: string,
): Promise<EchoReadStatePutResponse> {
  const ch = trimEchoPathSegment(channelId);
  return echoFetch<EchoReadStatePutResponse>(
    token,
    `/channels/${encodeURIComponent(ch)}/read-state`,
    {
      method: 'PUT',
      body: JSON.stringify({
        lastReadMessageId: trimEchoPathSegment(lastReadMessageId),
      }),
    },
  );
}

/** Body for `postEchoChannelMessage` (same fields as socket `message` payload; `channelId` is taken from the URL). */
export type EchoPostChannelMessageBody = {
  content: string;
  mentions?: unknown;
  replyTo?: unknown;
  /** Client idempotency key (UUID or Echo snowflake). */
  id?: string;
  correlationId?: string;
  imageUrl?: string;
  videoUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  poll?: unknown;
  attachments?: unknown;
  forwardMessageId?: string;
};

/**
 * Create a channel message via REST (parity with socket `message`).
 * Returns 201 with the new message, or 200 with `idempotentReplay: true` for duplicate sends inside the idempotency window.
 */
export async function postEchoChannelMessage(
  token: string,
  channelId: string,
  body: EchoPostChannelMessageBody,
): Promise<{ message: EchoApiMessage; idempotentReplay?: boolean }> {
  const ch = trimEchoPathSegment(channelId);
  const raw = await echoFetch<unknown>(
    token,
    `/channels/${encodeURIComponent(ch)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ ...body, channelId: ch }),
    },
  );
  return parseEchoPostChannelMessageResponse(
    raw,
    'POST /channels/.../messages',
  );
}

export type { EchoMessageSearchQueryInput as EchoMessageSearchParams };

export async function fetchEchoServerMessageSearch(
  token: string,
  serverId: string,
  params: EchoMessageSearchQueryInput,
  options?: { signal?: AbortSignal },
): Promise<{ messages: EchoApiMessage[] }> {
  const qs = buildEchoMessageSearchQueryString(params);
  const sid = trimEchoPathSegment(serverId);
  const raw = await echoFetch<unknown>(
    token,
    `/servers/${encodeURIComponent(sid)}/messages/search${qs ? `?${qs}` : ''}`,
    { signal: options?.signal },
  );
  return parseEchoMessagesListPayload(raw, 'GET /servers/.../messages/search');
}

export async function fetchEchoChannelMessageSearch(
  token: string,
  channelId: string,
  params: EchoMessageSearchQueryInput,
  options?: { signal?: AbortSignal },
): Promise<{ messages: EchoApiMessage[] }> {
  const qs = buildEchoMessageSearchQueryString(params);
  const ch = trimEchoPathSegment(channelId);
  const raw = await echoFetch<unknown>(
    token,
    `/channels/${encodeURIComponent(ch)}/messages/search${qs ? `?${qs}` : ''}`,
    { signal: options?.signal },
  );
  return parseEchoMessagesListPayload(raw, 'GET /channels/.../messages/search');
}
