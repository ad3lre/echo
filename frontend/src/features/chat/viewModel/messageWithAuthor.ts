import type {
  Embed,
  MessageAttachmentPayload,
  MessageAuthor,
  MessageReaction,
  MessageStickerPayload,
  MessageWithAuthor,
} from '@shared/types';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import { resolveMessageAuthorPresenceStatus } from '@/services/domain/presence';
import { normalizeMessageAttachments } from '@/utils/normalizeMessageAttachments';

const KEY_SEP = '\x1e';

/** FNV-1a 32-bit — fast stable digest for JSON payloads without storing the string on the key. */
function fnv1a32(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function contentJsonDigest(contentJson: unknown): string {
  if (contentJson === undefined || contentJson === null) return '';
  try {
    const s = JSON.stringify(contentJson);
    return `${s.length}:${fnv1a32(s)}`;
  } catch {
    return '!';
  }
}

export function attachmentFingerprint(
  attachments: MessageAttachmentPayload[] | undefined,
): string {
  if (!attachments?.length) return '0';
  return attachments
    .map(
      (a) =>
        `${a.url}\x1f${a.filename ?? ''}\x1f${a.mimeType ?? ''}\x1f${a.kind}\x1f${a.spoiler ? '1' : '0'}\x1f${a.width ?? ''}\x1f${a.height ?? ''}`,
    )
    .join('\x1d');
}

/** Exported for MessageList row fingerprints — must match cache invalidation for reaction edits. */
export function fingerprintMessageReactions(
  reactions: MessageReaction[] | undefined,
): string {
  if (!reactions?.length) return '';
  /** Order-invariant multiset: emoji + sorted member list + count (ignores display order / lastReactionAt). */
  const parts = reactions.map((r) => {
    const users = [...r.userIds].sort().join(',');
    return {
      sortKey: `${r.emoji}\x1f${users}`,
      line: `${r.emoji}:${r.count}:${users}`,
    };
  });
  parts.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return parts.map((p) => p.line).join('|');
}

function embedsFingerprint(embeds: Embed[] | undefined): string {
  if (!embeds?.length) return '';
  return embeds
    .map(
      (e) =>
        `${e.url ?? ''}\x1f${e.title ?? ''}\x1f${e.description ?? ''}\x1f${e.image?.url ?? ''}\x1f${e.image?.width ?? ''}\x1f${e.image?.height ?? ''}\x1f${e.thumbnail?.url ?? ''}\x1f${e.thumbnail?.width ?? ''}\x1f${e.thumbnail?.height ?? ''}\x1f${e.video?.embedUrl ?? ''}\x1f${e.video?.width ?? ''}\x1f${e.video?.height ?? ''}`,
    )
    .join('\x1d');
}

function stickersFingerprint(
  stickers: MessageStickerPayload[] | undefined,
): string {
  if (!stickers?.length) return '';
  return stickers
    .map((sticker) => {
      return `${sticker.id}\x1f${sticker.name}\x1f${sticker.format}\x1f${sticker.url}`;
    })
    .join('\x1d');
}

function mentionsFingerprint(
  mentions: RawMessage['mentions'] | undefined,
): string {
  if (!mentions?.length) return '';
  return mentions
    .map(
      (m) =>
        `${m.kind}\x1f${m.id}\x1f${m.start}\x1f${m.end}\x1f${m.label}\x1f${m.userId ?? ''}\x1f${m.channelId ?? ''}\x1f${m.roleId ?? ''}`,
    )
    .join('\x1d');
}

function pollFingerprint(poll: RawMessage['poll'] | undefined): string {
  if (!poll) return '';
  try {
    const s = JSON.stringify(poll);
    return `${s.length}:${fnv1a32(s)}`;
  } catch {
    return '!';
  }
}

function replyFingerprint(reply: RawMessage['replyTo'] | undefined): string {
  if (!reply) return '';
  return `${reply.messageId}\x1f${reply.authorName}\x1f${reply.content}`;
}

function forwardedFingerprint(
  fwd: RawMessage['forwardedFrom'] | undefined,
): string {
  if (!fwd) return '';
  return `${fwd.messageId}\x1f${fwd.channelId}\x1f${fwd.authorName}\x1f${fwd.contentPreview}`;
}

/**
 * Stable cache key for a row: only author + presence inputs that affect `author`,
 * plus message fields that flow into `MessageWithAuthor` (spread + normalized attachments).
 */
export function messageWithAuthorCacheKey(
  msg: RawMessage,
  user: UserForAuthor | undefined,
  presenceForAuthor: string | undefined,
): string {
  const row = user?.status?.trim() ?? '';
  const overlay = presenceForAuthor?.trim() ?? '';
  const userKey = user
    ? `u:${user.id}${KEY_SEP}${user.name}${KEY_SEP}${user.pfp}${KEY_SEP}${row}`
    : `n:${msg.authorId}${KEY_SEP}${msg.authorDisplayName ?? ''}${KEY_SEP}${msg.authorAvatar ?? ''}`;
  const overlayKey = `p:${overlay}`;
  const bodyKey = [
    msg.id ?? '',
    msg.systemMessage ? '1' : '0',
    msg.authorIsDiscordShadow ? '1' : '0',
    msg.authorDiscordUserId ?? '',
    msg.timestamp,
    msg.content,
    msg.contentText ?? '',
    msg.editedAt ?? '',
    String(msg.messageFormatVersion ?? ''),
    String(msg.contentSchemaVersion ?? ''),
    contentJsonDigest(msg.contentJson),
    msg.gif ? '1' : '0',
    msg.imageUrl ?? '',
    msg.imageSpoiler ? '1' : '0',
    msg.videoUrl ?? '',
    msg.audioUrl ?? '',
    attachmentFingerprint(msg.attachments),
    stickersFingerprint(msg.stickers),
    fingerprintMessageReactions(msg.reactions),
    embedsFingerprint(msg.embeds),
    mentionsFingerprint(msg.mentions),
    pollFingerprint(msg.poll),
    replyFingerprint(msg.replyTo),
    forwardedFingerprint(msg.forwardedFrom),
    msg.tts ? '1' : '0',
    String(msg.messageFlags ?? ''),
    contentJsonDigest(msg.components),
  ].join(KEY_SEP);
  return `${userKey}${KEY_SEP}${overlayKey}${KEY_SEP}${bodyKey}`;
}

export function resolveAuthorStatus(
  user: UserForAuthor | undefined,
  authorId: string,
  presenceByUserId: Record<string, string>,
): MessageAuthor['status'] {
  return resolveMessageAuthorPresenceStatus({
    rowStatus: user?.status,
    overlayStatus: presenceByUserId[authorId],
  }) as MessageAuthor['status'];
}

/**
 * Fingerprint for the active channel’s mapped list: same string iff every
 * `messageWithAuthorCacheKey` for `sorted` would match the previous run.
 *
 * `orderRevision` alone is not enough: in-place message edits in `messageIndex` do not bump
 * order revision, so row keys must include message body fields (via `messageWithAuthorCacheKey`).
 */
export function channelActiveMessagesFingerprint(
  channelId: string,
  orderRevision: number,
  orderedIds: readonly string[],
  entitiesById: Map<string, RawMessage>,
  lookup: Map<string, UserForAuthor>,
  presenceByUserId: Record<string, string>,
): string {
  const head = `${channelId}${KEY_SEP}${orderRevision}${KEY_SEP}${orderedIds.length}${KEY_SEP}`;
  if (orderedIds.length === 0) return head;
  let acc = head;
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i]!;
    const m = entitiesById.get(id);
    if (!m) continue;
    if (i > 0) acc += KEY_SEP;
    acc += messageWithAuthorCacheKey(
      m,
      lookup.get(m.authorId),
      presenceByUserId[m.authorId],
    );
  }
  return acc;
}

export function buildMessageWithAuthor(
  msg: RawMessage,
  lookup: Map<string, UserForAuthor>,
  presenceByUserId: Record<string, string>,
): MessageWithAuthor {
  const user = lookup.get(msg.authorId);
  const st = resolveAuthorStatus(user, msg.authorId, presenceByUserId);
  const shadow = msg.authorIsDiscordShadow === true;
  const author: MessageAuthor = user
    ? {
        id: user.id,
        name: user.name,
        avatar: user.pfp,
        status: st,
        ...(typeof user.timeZone === 'string' && user.timeZone.trim()
          ? { timeZone: user.timeZone.trim() }
          : {}),
        ...(shadow ? { isDiscordShadow: true } : {}),
      }
    : {
        id: msg.authorId,
        name: msg.authorDisplayName?.trim() || 'Unknown',
        avatar: msg.authorAvatar?.trim() ?? '',
        ...(st ? { status: st } : {}),
        ...(shadow ? { isDiscordShadow: true } : {}),
      };
  return {
    ...msg,
    author,
    attachments: normalizeMessageAttachments(msg.attachments),
  };
}
