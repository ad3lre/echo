import { randomUUID } from 'node:crypto';
import {
  Client,
  MessageReferenceType,
  StickerFormatType,
  type Attachment,
  type Emoji,
  type Message,
  type Poll,
  type Sticker,
} from 'discord.js';

/** Keep aligned with `server/backend/src/sockets/messageValidation.ts` poll caps. */
const MAX_POLL_QUESTION_LENGTH = 500;
const MAX_POLL_OPTION_TEXT_LENGTH = 200;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 10;
const MAX_POLL_OPTION_EMOJI_LENGTH = 64;
const MAX_FORWARD_PREVIEW_LENGTH = 500;

export type ExportedMessageAuthor = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type ExportedMessageAttachment = {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  size: number;
};

/** Serialized poll for Echo import (`sanitizePollForStorage` on the backend). */
export type ExportedPoll = {
  question: string;
  options: { id: string; text: string; emoji?: string }[];
  endsAt?: string;
};

/** Forward snapshot from Discord (IDs are Discord snowflakes; backend maps channel → Echo). */
export type ExportedForwardedFrom = {
  sourceChannelId: string;
  sourceMessageId: string;
  authorName: string;
  authorAvatar?: string;
  contentPreview: string;
};

export type ExportedMessageReference = {
  messageId: string;
  channelId: string;
};

export type ExportedMessage = {
  id: string;
  content: string;
  timestamp: string;
  author: ExportedMessageAuthor;
  /** Discord API embed payloads (from `Embed#toJSON()`), for bot / webhook embed-only messages. */
  embeds?: ReturnType<import('discord.js').Embed['toJSON']>[];
  attachments: ExportedMessageAttachment[];
  stickers: ExportedMessageSticker[];
  poll?: ExportedPoll;
  forwardedFrom?: ExportedForwardedFrom;
  messageReference?: ExportedMessageReference;
};

export type ExportedMessageSticker = {
  id: string;
  name: string;
  format: 'png' | 'apng' | 'gif' | 'lottie';
  url: string;
};

/**
 * Resolve author for Echo shadow users (humans, bots, and application/webhook users).
 * Prefer `member.user` when `author` is missing (rare cache/API edge cases).
 */
function resolveExportedAuthor(m: Message): ExportedMessageAuthor | null {
  const user = m.author ?? m.member?.user ?? null;
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName,
    avatar: user.displayAvatarURL({ size: 256 }),
  };
}

function exportedStickerFormat(
  sticker: Sticker,
): ExportedMessageSticker['format'] {
  switch (sticker.format) {
    case StickerFormatType.APNG:
      return 'apng';
    case StickerFormatType.GIF:
      return 'gif';
    case StickerFormatType.Lottie:
      return 'lottie';
    case StickerFormatType.PNG:
    default:
      return 'png';
  }
}

function formatPollAnswerEmoji(
  answer:
    | import('discord.js').PollAnswer
    | import('discord.js').PartialPollAnswer,
): string | undefined {
  const em = answer.emoji as Emoji | null;
  if (!em) return undefined;
  if (em.id) {
    const name = em.name ?? 'emoji';
    const animated = 'animated' in em && em.animated === true;
    return `<${animated ? 'a' : ''}:${name}:${em.id}>`;
  }
  const n = em.name;
  if (typeof n === 'string' && n.trim())
    return n.trim().slice(0, MAX_POLL_OPTION_EMOJI_LENGTH);
  return undefined;
}

function mapDiscordPollToExported(poll: Poll): ExportedPoll | undefined {
  const rawQ = (poll.question?.text ?? '')
    .trim()
    .slice(0, MAX_POLL_QUESTION_LENGTH);
  const question = rawQ.length > 0 ? rawQ : 'Poll';
  const sorted = [...poll.answers.values()].sort((a, b) => a.id - b.id);
  if (sorted.length < MIN_POLL_OPTIONS || sorted.length > MAX_POLL_OPTIONS) {
    return undefined;
  }

  const options: ExportedPoll['options'] = [];
  for (const a of sorted) {
    const text = (a.text ?? '').trim().slice(0, MAX_POLL_OPTION_TEXT_LENGTH);
    if (!text) return undefined;
    const emojiRaw = formatPollAnswerEmoji(a);
    const emoji =
      emojiRaw && emojiRaw.length <= MAX_POLL_OPTION_EMOJI_LENGTH
        ? emojiRaw
        : emojiRaw
          ? emojiRaw.slice(0, MAX_POLL_OPTION_EMOJI_LENGTH)
          : undefined;
    options.push({
      id: randomUUID(),
      text,
      ...(emoji ? { emoji } : {}),
    });
  }

  const endsAt =
    poll.expiresTimestamp != null && Number.isFinite(poll.expiresTimestamp)
      ? new Date(poll.expiresTimestamp).toISOString()
      : undefined;

  return {
    question,
    options,
    ...(endsAt ? { endsAt } : {}),
  };
}

function buildExportedForwardedFrom(
  m: Message,
): ExportedForwardedFrom | undefined {
  if (!m.reference?.messageId || !m.reference.channelId) return undefined;
  if (!m.messageSnapshots.size) return undefined;
  /** Prefer explicit forward type; snapshots imply forward even if `type` is missing from payload. */
  if (
    m.reference.type != null &&
    m.reference.type !== MessageReferenceType.Forward
  ) {
    return undefined;
  }

  const snap =
    m.messageSnapshots.get(m.reference.messageId) ?? m.messageSnapshots.first();
  if (!snap) return undefined;

  const previewRaw = (snap.content ?? '').trim();
  let contentPreview = previewRaw.slice(0, MAX_FORWARD_PREVIEW_LENGTH);
  if (!contentPreview) {
    if (snap.embeds?.length) contentPreview = '[Embed]';
    else if (snap.attachments.size > 0) contentPreview = '[Attachment]';
    else contentPreview = ' ';
  }

  const user = snap.author;
  const authorName = (
    user?.globalName?.trim() ||
    user?.username ||
    'Unknown'
  ).slice(0, 128);

  const authorAvatar = user?.displayAvatarURL({ size: 256 }) || undefined;

  return {
    sourceChannelId: m.reference.channelId,
    sourceMessageId: m.reference.messageId,
    authorName,
    ...(authorAvatar ? { authorAvatar } : {}),
    contentPreview,
  };
}

/**
 * Fetches last N messages from a Discord channel.
 * Requires GuildMessages and MessageContent intents.
 */
export async function fetchChannelMessages(
  client: Client,
  channelId: string,
  limit: number,
): Promise<ExportedMessage[]> {
  const channel = await client.channels.fetch(channelId);
  if (!channel) {
    throw new Error(`Channel ${channelId} not found`);
  }

  if (!channel.isTextBased()) {
    throw new Error(`Channel ${channelId} is not a text-based channel`);
  }

  /** `cache: false` avoids reusing stale partial rows when the bot has cached messages. */
  const messages = await channel.messages.fetch({ limit, cache: false });

  const out: ExportedMessage[] = [];
  for (const m of messages.values()) {
    const author = resolveExportedAuthor(m);
    if (!author) continue;

    if (m.poll?.partial) {
      try {
        await m.poll.fetch();
      } catch {
        // Partial poll data — omit poll from export if still incomplete.
      }
    }

    const embeds =
      m.embeds.length > 0 ? m.embeds.map((e) => e.toJSON()) : undefined;

    const exportedPoll =
      m.poll && !m.poll.partial ? mapDiscordPollToExported(m.poll) : undefined;
    const forwardedFrom = buildExportedForwardedFrom(m);
    const ref = m.reference;

    out.push({
      id: m.id,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      author,
      ...(embeds ? { embeds } : {}),
      ...(ref?.messageId
        ? {
            messageReference: {
              messageId: ref.messageId,
              channelId: ref.channelId ?? m.channelId,
            },
          }
        : {}),
      attachments: m.attachments.map((a: Attachment) => ({
        id: a.id,
        url: (a.url || a.proxyURL || '').trim(),
        filename: a.name,
        contentType: a.contentType,
        size: a.size,
      })),
      stickers: [...m.stickers.values()].map((sticker) => ({
        id: sticker.id,
        name: sticker.name,
        format: exportedStickerFormat(sticker),
        url: sticker.url,
      })),
      ...(exportedPoll ? { poll: exportedPoll } : {}),
      ...(forwardedFrom ? { forwardedFrom } : {}),
    });
  }
  return out;
}
