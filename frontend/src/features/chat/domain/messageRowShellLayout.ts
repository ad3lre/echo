import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import type { HistorySkeletonImageBlock } from '@/features/chat/components/messageListHistorySkeleton';
import { messagePreviewPlainText } from '@/services/domain/messagePreviewPlain';
import { walkImageSlots } from '@shared/imageSlotContentJson';

export type MessageRowShellLayout = {
  grouped: boolean;
  clustered: boolean;
  authorName: string;
  bodyLines: string[];
  imageBlocks: HistorySkeletonImageBlock[];
  showReplyBlock: boolean;
  showForwardedBlock: boolean;
  showPollBlock: boolean;
  showReactions: boolean;
  reactionCount: number;
  isSystemMessage: boolean;
  systemText: string;
};

const MAX_SHELL_BODY_LINES = 3;
const SHELL_LINE_CHAR_BUDGET = 220;

function splitBodyLines(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 72 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, MAX_SHELL_BODY_LINES);
}

function imageBlocksForMessage(
  row: MessageListRowPresentation,
): HistorySkeletonImageBlock[] {
  const message = row.message;
  const blocks: HistorySkeletonImageBlock[] = [];
  const attachment = message.attachments?.[0];
  if (attachment?.width && attachment.height) {
    blocks.push({
      aspectW: attachment.width,
      aspectH: attachment.height,
    });
  } else if (
    message.imageUrl ||
    message.gif ||
    message.videoUrl ||
    message.attachments?.some(
      (a) => a.kind === 'image' || a.kind === 'gif' || a.kind === 'video',
    )
  ) {
    blocks.push({ aspectW: 16, aspectH: 9 });
  }
  for (const slot of walkImageSlots(message.contentJson)) {
    blocks.push({ aspectW: slot.aspectW, aspectH: slot.aspectH });
  }
  return blocks.slice(0, 2);
}

export function buildMessageRowShellLayout(
  row: MessageListRowPresentation,
  authorName: string,
): MessageRowShellLayout {
  const message = row.message;
  if (message.systemMessage) {
    return {
      grouped: false,
      clustered: false,
      authorName: '',
      bodyLines: [],
      imageBlocks: [],
      showReplyBlock: false,
      showForwardedBlock: false,
      showPollBlock: false,
      showReactions: false,
      reactionCount: 0,
      isSystemMessage: true,
      systemText:
        message.contentText?.trim() ||
        message.content?.trim() ||
        'System message',
    };
  }

  const preview = messagePreviewPlainText(message, SHELL_LINE_CHAR_BUDGET);
  return {
    grouped: row.layout.groupedWithPrevious,
    clustered: row.layout.groupedWithNext,
    authorName: authorName.trim() || message.author?.name?.trim() || 'Unknown',
    bodyLines: splitBodyLines(preview),
    imageBlocks: imageBlocksForMessage(row),
    showReplyBlock: !!message.replyTo,
    showForwardedBlock: !!message.forwardedFrom,
    showPollBlock: !!message.poll,
    showReactions: (message.reactions?.length ?? 0) > 0,
    reactionCount: message.reactions?.length ?? 0,
    isSystemMessage: false,
    systemText: '',
  };
}
