import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import { emojiBodyGeometryFingerprint } from '@/features/chat/domain/messageBodyEmojiGeometry';
import type { MessagePlainFields } from '@/services/domain/messageDisplayPlain';
import { plainTextForMessageFields } from '@/services/domain/messageDisplayPlain';
import { isMarkdownKatexReady } from '@/composables/markdownKatex';
import { hasMarkdownMathRegions } from '@/composables/markdownMathRegions';

/**
 * Stable layout fingerprint for a message list row. Used to invalidate cached
 * measured heights when content that affects row geometry changes.
 */
export function buildMessageRowRevisionKey(
  row: Pick<
    MessageListRowPresentation,
    | 'layout'
    | 'showDaySeparatorBefore'
    | 'showUnreadSeparatorBefore'
    | 'isCompact'
  >,
  message: MessagePlainFields & {
    attachments?: readonly { kind?: string; width?: number; height?: number }[];
    embeds?: readonly unknown[];
    reactions?: readonly unknown[];
    stickers?: readonly unknown[];
    poll?: unknown;
    replyTo?: unknown;
    forwardedFrom?: unknown;
    imageUrl?: string;
    gif?: unknown;
    videoUrl?: string;
    editedAt?: string;
  },
): string {
  const body = plainTextForMessageFields(message);
  const bodyGeometry = textGeometryFingerprint(body);
  const attachments = message.attachments ?? [];
  const poll = pollGeometryFingerprint(message.poll);
  const hasMath = hasMarkdownMathRegions(body);
  // Pending → typeset changes painted height without changing message text.
  const katexPhase = hasMath ? (isMarkdownKatexReady() ? 'k1' : 'k0') : 'kn';
  const parts = [
    row.layout.groupedWithPrevious ? 'g1' : 'g0',
    row.showDaySeparatorBefore ? 'd1' : 'd0',
    row.showUnreadSeparatorBefore ? 'u1' : 'u0',
    row.isCompact ? 'c1' : 'c0',
    `b:${bodyGeometry}`,
    `eg:${emojiBodyGeometryFingerprint(body)}`,
    katexPhase,
    `at:${attachments.length}`,
    `em:${embedGeometryFingerprint(message.embeds)}`,
    `rx:${message.reactions?.length ?? 0}`,
    `st:${message.stickers?.length ?? 0}`,
    `p:${poll}`,
    message.replyTo ? 'r1' : 'r0',
    message.forwardedFrom ? 'f1' : 'f0',
    message.imageUrl ? 'i1' : 'i0',
    message.gif ? 'gif1' : 'gif0',
    message.videoUrl ? 'v1' : 'v0',
    message.editedAt ? 'e1' : 'e0',
    attachments
      .map((a) => `${a.kind ?? ''}:${a.width ?? 0}x${a.height ?? 0}`)
      .join(','),
  ];
  return parts.join('|');
}

function embedGeometryFingerprint(
  embeds: readonly unknown[] | undefined,
): string {
  if (!embeds?.length) return '0';
  return embeds
    .map((embed) => {
      if (!embed || typeof embed !== 'object') return 'x';
      const value = embed as {
        title?: unknown;
        description?: unknown;
        provider?: unknown;
        author?: { name?: unknown };
        fields?: unknown;
        footer?: { text?: unknown };
        timestamp?: unknown;
        image?: { url?: unknown; width?: unknown; height?: unknown };
        thumbnail?: { url?: unknown; width?: unknown; height?: unknown };
        video?: { embedUrl?: unknown; kind?: unknown };
        echoJump?: unknown;
      };
      const fields = Array.isArray(value.fields) ? value.fields : [];
      const fieldGeometry = fields
        .map((field) => {
          if (!field || typeof field !== 'object') return 'x';
          const f = field as {
            name?: unknown;
            value?: unknown;
            inline?: unknown;
          };
          return `${stringLength(f.name)}:${stringLength(f.value)}:${f.inline === true ? 1 : 0}`;
        })
        .join(',');
      return [
        value.echoJump ? 'j1' : 'j0',
        stringLength(value.provider),
        stringLength(value.author?.name),
        stringLength(value.title),
        stringLength(value.description),
        fieldGeometry,
        stringLength(value.footer?.text),
        value.timestamp ? 1 : 0,
        mediaGeometryFingerprint(value.image),
        mediaGeometryFingerprint(value.thumbnail),
        value.video?.embedUrl ? 'v1' : 'v0',
        typeof value.video?.kind === 'string' ? value.video.kind : '',
      ].join(':');
    })
    .join('|');
}

function mediaGeometryFingerprint(
  media:
    | { url?: unknown; width?: unknown; height?: unknown }
    | null
    | undefined,
): string {
  if (!media?.url) return '0';
  const width = typeof media.width === 'number' ? media.width : 0;
  const height = typeof media.height === 'number' ? media.height : 0;
  return `1:${width}x${height}`;
}

function stringLength(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function pollGeometryFingerprint(poll: unknown): string {
  if (!poll || typeof poll !== 'object') return '0';
  const p = poll as {
    question?: unknown;
    options?: unknown;
    endsAt?: unknown;
    anonymous?: unknown;
  };
  const questionLength = typeof p.question === 'string' ? p.question.length : 0;
  const options = Array.isArray(p.options) ? p.options : [];
  const optionParts = options.map((option) => {
    if (!option || typeof option !== 'object') return '0:0:0:0';
    const o = option as {
      text?: unknown;
      votes?: unknown;
      voterIds?: unknown;
      emoji?: unknown;
    };
    const textLength = typeof o.text === 'string' ? o.text.length : 0;
    const votes = typeof o.votes === 'number' ? o.votes : 0;
    const voterCount = Array.isArray(o.voterIds) ? o.voterIds.length : 0;
    const hasEmoji = o.emoji ? 1 : 0;
    return `${textLength}:${votes}:${voterCount}:${hasEmoji}`;
  });
  return [
    1,
    questionLength,
    options.length,
    p.endsAt ? 1 : 0,
    p.anonymous === true ? 1 : 0,
    optionParts.join(','),
  ].join(':');
}

function textGeometryFingerprint(text: string): string {
  const lines = text.split('\n');
  const lineLengths = lines.map((line) => line.length);
  return [text.length, lines.length, lineLengths.join(',')].join(':');
}
