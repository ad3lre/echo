import type pg from 'pg';
import { DISCORD_BOT_INTERNAL_FETCH_MS } from '../constants/outboundHttp';
import { config } from '../config';
import {
  discordCdnUrlStableKey,
  isDiscordHostedImportMediaUrl,
  pickDiscordIconUrl,
  pickDiscordUrlOrProxy,
} from '../domain/discordCdnUrls';
import {
  getEchoMessageById,
  listEchoMessageIdsInChannel,
  updateEchoMessageDiscordImportMirroredMedia,
  type EchoMessageRow,
} from '../domain/echoMessagesDal';
import { echoMessageRowNeedsDiscordMediaMirror } from './discordImportMediaMirrorQueue';
import {
  parseImportedAttachments,
  parseImportedEmbeds,
  parseImportedStickers,
} from './discordMessageImport';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageStickerPayload,
  ReplyTo,
} from '../../../shared/types';

type BotFetchedMessage = {
  id?: unknown;
  attachments?: unknown;
  stickers?: unknown;
  embeds?: unknown;
  forwardedFrom?: unknown;
};

/** Fresh Discord CDN URLs keyed by stable path (see `discordCdnUrlStableKey`). */
export function buildDiscordMediaUrlIndexFromBotMessage(
  raw: BotFetchedMessage,
): Map<string, string> {
  const keyToUrl = new Map<string, string>();
  const add = (url: string | undefined) => {
    if (!url?.trim()) return;
    const k = discordCdnUrlStableKey(url);
    if (k) keyToUrl.set(k, url.trim());
  };

  const attachments = parseImportedAttachments(raw.attachments);
  if (attachments) {
    for (const a of attachments) add(a.url);
  }
  const stickers = parseImportedStickers(raw.stickers);
  if (stickers) {
    for (const s of stickers) add(s.url);
  }
  const embeds = parseImportedEmbeds(raw.embeds);
  if (embeds) {
    for (const e of embeds) {
      add(e.image?.url);
      add(e.thumbnail?.url);
      add(e.footer?.icon_url);
      add(e.author?.icon_url);
    }
  }
  if (raw.forwardedFrom && typeof raw.forwardedFrom === 'object') {
    const av = (raw.forwardedFrom as { authorAvatar?: unknown }).authorAvatar;
    if (typeof av === 'string') add(av);
  }

  return keyToUrl;
}

function collectRowDiscordUrls(row: EchoMessageRow): string[] {
  const out: string[] = [];
  const push = (u: string | undefined) => {
    if (typeof u === 'string' && isDiscordHostedImportMediaUrl(u))
      out.push(u.trim());
  };
  push(row.imageUrl);
  push(row.videoUrl);
  push(row.audioUrl);
  if (Array.isArray(row.attachments)) {
    for (const a of row.attachments) push(a?.url);
  }
  if (Array.isArray(row.stickers)) {
    for (const s of row.stickers) {
      if (s?.format === 'lottie') continue;
      push(s?.url);
    }
  }
  if (Array.isArray(row.embeds)) {
    for (const e of row.embeds) {
      if (!e || typeof e !== 'object') continue;
      const emb = e as Embed;
      push(emb.image?.url);
      push(emb.thumbnail?.url);
      push(emb.footer?.icon_url);
      push(emb.author?.icon_url);
    }
  }
  push(row.forwardedFrom?.authorAvatar);
  if (row.replyTo && typeof row.replyTo === 'object') {
    const av = (row.replyTo as { authorAvatar?: unknown }).authorAvatar;
    if (typeof av === 'string') push(av);
  }
  return out;
}

/** Map stored Discord CDN URL → fresh URL when the stable path matches. */
export function buildDiscordMediaRefreshUrlMap(
  row: EchoMessageRow,
  freshByStableKey: Map<string, string>,
): Map<string, string> {
  const urlMap = new Map<string, string>();
  for (const oldUrl of collectRowDiscordUrls(row)) {
    const key = discordCdnUrlStableKey(oldUrl);
    if (!key) continue;
    const fresh = freshByStableKey.get(key);
    if (fresh && fresh !== oldUrl) urlMap.set(oldUrl, fresh);
  }
  return urlMap;
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
): Embed[] | undefined {
  if (!Array.isArray(embeds)) return undefined;
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
  return out.length ? out : undefined;
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

export function mergeEchoRowAfterDiscordCdnRefresh(
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
  return {
    attachments: row.attachments
      ? patchAttachments(row.attachments, urlMap)
      : undefined,
    stickers: row.stickers ? patchStickers(row.stickers, urlMap) : undefined,
    embeds: patchEmbedsInPlace(row.embeds, urlMap),
    imageUrl,
    videoUrl,
    audioUrl,
    forwardedFrom: row.forwardedFrom
      ? patchForwarded(row.forwardedFrom, urlMap)
      : undefined,
    replyTo: row.replyTo ? patchReply(row.replyTo, urlMap) : undefined,
  };
}

export async function fetchDiscordChannelMessagesFromBot(
  discordChannelId: string,
  limit: number,
): Promise<BotFetchedMessage[]> {
  const botPort = process.env.ECHO_DISCORD_BOT_INTERNAL_PORT || '3005';
  const botSecret = config.echoDiscordBotWebhookSecret;
  const botUrl = `http://localhost:${botPort}/channels/${discordChannelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`;
  const res = await fetch(botUrl, {
    signal: AbortSignal.timeout(DISCORD_BOT_INTERNAL_FETCH_MS),
    headers: { 'x-echo-discord-bot-secret': botSecret },
  });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const errMsg =
      typeof errorBody.error === 'string' ? errorBody.error : res.statusText;
    throw new Error(`Bot request failed: ${errMsg}`);
  }
  const { messages } = (await res.json()) as { messages: BotFetchedMessage[] };
  return Array.isArray(messages) ? messages : [];
}

export type DiscordImportCdnRefreshChannelResult = {
  echoChannelId: string;
  discordChannelId: string;
  fetchedFromDiscord: number;
  scanned: number;
  updated: number;
  skippedNoDiscordRow: number;
  skippedNoMatch: number;
};

/**
 * Re-fetch Discord channel history and rewrite expired CDN signatures on imported messages.
 * Message ids must still be Discord snowflakes (bulk import path).
 */
export async function refreshDiscordImportCdnUrlsForChannel(
  pool: pg.Pool,
  row: {
    echoChannelId: string;
    discordChannelId: string;
    messageCount: number;
  },
  opts: { execute: boolean },
): Promise<DiscordImportCdnRefreshChannelResult> {
  const limit = Math.min(100, Math.max(1, row.messageCount || 90));
  const fetched = await fetchDiscordChannelMessagesFromBot(
    row.discordChannelId,
    limit,
  );
  const freshByMessageId = new Map<string, Map<string, string>>();
  for (const m of fetched) {
    const id =
      typeof m.id === 'string' ? m.id.trim() : String(m.id ?? '').trim();
    if (!id) continue;
    freshByMessageId.set(id, buildDiscordMediaUrlIndexFromBotMessage(m));
  }

  const messageIds = await listEchoMessageIdsInChannel(pool, row.echoChannelId);

  let updated = 0;
  let skippedNoDiscordRow = 0;
  let skippedNoMatch = 0;

  for (const messageId of messageIds) {
    const echoRow = await getEchoMessageById(pool, messageId);
    if (!echoRow || echoRow.channelId !== row.echoChannelId) continue;
    if (!echoMessageRowNeedsDiscordMediaMirror(echoRow)) continue;

    const freshByKey = freshByMessageId.get(messageId);
    if (!freshByKey) {
      skippedNoDiscordRow += 1;
      continue;
    }

    const urlMap = buildDiscordMediaRefreshUrlMap(echoRow, freshByKey);
    if (urlMap.size === 0) {
      skippedNoMatch += 1;
      continue;
    }

    if (opts.execute) {
      const patch = mergeEchoRowAfterDiscordCdnRefresh(echoRow, urlMap);
      await updateEchoMessageDiscordImportMirroredMedia(
        pool,
        row.echoChannelId,
        messageId,
        patch,
      );
    }
    updated += 1;
  }

  return {
    echoChannelId: row.echoChannelId,
    discordChannelId: row.discordChannelId,
    fetchedFromDiscord: fetched.length,
    scanned: messageIds.length,
    updated,
    skippedNoDiscordRow,
    skippedNoMatch,
  };
}

/** Collect raw attachment/embed URLs from bot JSON (pre-parse) for tests. */
export function collectBotMessageDiscordUrls(
  raw: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const add = (url: string) => {
    if (isDiscordHostedImportMediaUrl(url)) out.push(url.trim());
  };
  const attachments = raw.attachments;
  if (Array.isArray(attachments)) {
    for (const item of attachments) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const url = pickDiscordUrlOrProxy(o);
      if (url) add(url);
    }
  }
  const embeds = raw.embeds;
  if (Array.isArray(embeds)) {
    for (const item of embeds) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const image = o.image;
      if (image && typeof image === 'object') {
        const url = pickDiscordUrlOrProxy(image as Record<string, unknown>);
        if (url) add(url);
      }
      const thumb = o.thumbnail;
      if (thumb && typeof thumb === 'object') {
        const url = pickDiscordUrlOrProxy(thumb as Record<string, unknown>);
        if (url) add(url);
      }
      const footer = o.footer;
      if (footer && typeof footer === 'object') {
        const url = pickDiscordIconUrl(footer as Record<string, unknown>);
        if (url) add(url);
      }
      const author = o.author;
      if (author && typeof author === 'object') {
        const url = pickDiscordIconUrl(author as Record<string, unknown>);
        if (url) add(url);
      }
    }
  }
  return out;
}
