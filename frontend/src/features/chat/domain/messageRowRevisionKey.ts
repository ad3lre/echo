import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import type { MessagePlainFields } from '@/services/domain/messageDisplayPlain';
import { plainTextForMessageFields } from '@/services/domain/messageDisplayPlain';

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
  const attachments = message.attachments ?? [];
  const parts = [
    row.layout.groupedWithPrevious ? 'g1' : 'g0',
    row.showDaySeparatorBefore ? 'd1' : 'd0',
    row.showUnreadSeparatorBefore ? 'u1' : 'u0',
    row.isCompact ? 'c1' : 'c0',
    `bl:${body.length}`,
    `at:${attachments.length}`,
    `em:${message.embeds?.length ?? 0}`,
    `rx:${message.reactions?.length ?? 0}`,
    `st:${message.stickers?.length ?? 0}`,
    message.poll ? 'p1' : 'p0',
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
