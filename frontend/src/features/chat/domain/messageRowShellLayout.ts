import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import type { HistorySkeletonImageBlock } from '@/features/chat/components/messageListHistorySkeleton';
import {
  CHAT_MEDIA_BOX_ASPECT_H,
  CHAT_MEDIA_BOX_ASPECT_W,
  CHAT_MEDIA_BOX_MAX_WIDTH_CSS,
  CHAT_MEDIA_BOX_MAX_WIDTH_PX,
} from '@/features/chat/domain/messageMediaCollage';
import { CHAT_IMAGE_SLOT_MAX_WIDTH_PX } from '@/utils/chatMediaAspect';
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
  pollBlockHeightPx: number;
  showReactions: boolean;
  reactionCount: number;
  isSystemMessage: boolean;
  systemText: string;
};

const MAX_SHELL_BODY_LINES = 3;
const SHELL_LINE_CHAR_BUDGET = 220;
const SHELL_IMAGE_SLOT_MAX_WIDTH_CSS = 'min(100%, min(92vw, 36rem))';
const SHELL_POLL_BASE_HEIGHT_PX = 128;
const SHELL_POLL_OPTION_HEIGHT_PX = 24;
const SHELL_POLL_MAX_OPTIONS_HEIGHT_PX = 120;

function mediaSkeletonBlock(): HistorySkeletonImageBlock {
  return {
    aspectW: CHAT_MEDIA_BOX_ASPECT_W,
    aspectH: CHAT_MEDIA_BOX_ASPECT_H,
    maxWidthCss: CHAT_MEDIA_BOX_MAX_WIDTH_CSS,
    maxWidthPx: CHAT_MEDIA_BOX_MAX_WIDTH_PX,
  };
}

function imageSlotSkeletonBlock(
  aspectW: number,
  aspectH: number,
): HistorySkeletonImageBlock {
  return {
    aspectW,
    aspectH,
    maxWidthCss: SHELL_IMAGE_SLOT_MAX_WIDTH_CSS,
    maxWidthPx: CHAT_IMAGE_SLOT_MAX_WIDTH_PX,
  };
}

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
  if (
    message.imageUrl ||
    message.gif ||
    message.attachments?.some((a) => a.kind === 'image' || a.kind === 'gif')
  ) {
    blocks.push(mediaSkeletonBlock());
  } else if (
    attachment?.kind === 'video' &&
    attachment.width &&
    attachment.height
  ) {
    blocks.push({
      aspectW: attachment.width,
      aspectH: attachment.height,
    });
  } else if (
    message.videoUrl ||
    message.attachments?.some((a) => a.kind === 'video')
  ) {
    blocks.push(mediaSkeletonBlock());
  }
  for (const slot of walkImageSlots(message.contentJson)) {
    blocks.push(imageSlotSkeletonBlock(slot.aspectW, slot.aspectH));
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
      pollBlockHeightPx: 0,
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
    pollBlockHeightPx: message.poll
      ? SHELL_POLL_BASE_HEIGHT_PX +
        Math.min(
          SHELL_POLL_MAX_OPTIONS_HEIGHT_PX,
          (message.poll.options?.length ?? 0) * SHELL_POLL_OPTION_HEIGHT_PX,
        )
      : 0,
    showReactions: (message.reactions?.length ?? 0) > 0,
    reactionCount: message.reactions?.length ?? 0,
    isSystemMessage: false,
    systemText: '',
  };
}
