import type { MessageWithAuthor } from '@shared/types';
import { walkImageSlots } from '@shared/imageSlotContentJson';
import { countButtonRows } from '@shared/buttonRowContentJson';
import { CHAT_MEDIA_BOX_HEIGHT_PX } from '@/features/chat/domain/messageMediaCollage';
import {
  CHAT_IMAGE_SLOT_MAX_WIDTH_PX,
  estimateChatBitmapBlockPx,
} from '@/utils/chatMediaAspect';

export const MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX = 88;
export const MESSAGE_LIST_ROW_ESTIMATE_MIN_PX = 64;
/** Continuation rows are avatar-less and much shorter than headers. */
export const MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX = 28;
export const MESSAGE_LIST_ROW_ESTIMATE_MAX_PX = 520;

export type MessageListRowEstimateInput = {
  groupedWithPrevious: boolean;
  showDaySeparatorBefore: boolean;
  message: Pick<
    MessageWithAuthor,
    | 'contentText'
    | 'content'
    | 'replyTo'
    | 'forwardedFrom'
    | 'poll'
    | 'attachments'
    | 'videoUrl'
    | 'imageUrl'
    | 'gif'
    | 'stickers'
    | 'embeds'
    | 'reactions'
    | 'contentJson'
  >;
};

/** Body line box — matches `.message-text` line-height (1.375rem) in messageBubble.scss. */
const MESSAGE_LIST_BODY_LINE_PX = 22;
/** Header chrome: group margin-top + vertical padding + author/timestamp row. */
const MESSAGE_LIST_HEADER_CHROME_PX = 50;
/** Continuation chrome: just the tight `.msg-continuation` vertical padding. */
const MESSAGE_LIST_GROUPED_CHROME_PX = 6;
/** Avg glyphs per rendered line inside the message column before soft-wrap (rough). */
const MESSAGE_LIST_CHARS_PER_LINE = 100;
/** Cap line contribution so a wall of text cannot blow past the row max. */
const MESSAGE_LIST_MAX_BODY_LINES = 12;
/** Matches `MessageImageSlot` max width at 16px root (`36rem`). */
const MESSAGE_IMAGE_SLOT_MAX_WIDTH_PX = CHAT_IMAGE_SLOT_MAX_WIDTH_PX;
/** Matches `MessageImageSlot` vertical margin (`my-2`). */
const MESSAGE_IMAGE_SLOT_VERTICAL_MARGIN_PX = 16;
/** Vertical margin around the fixed media collage box (`space-y-2` / `mt-1`). */
const MESSAGE_MEDIA_BOX_VERTICAL_MARGIN_PX = 8;

function estimateImageSlotBlockPx(aspectW: number, aspectH: number): number {
  return estimateChatBitmapBlockPx(aspectW, aspectH, {
    maxWidthPx: MESSAGE_IMAGE_SLOT_MAX_WIDTH_PX,
    verticalMarginPx: MESSAGE_IMAGE_SLOT_VERTICAL_MARGIN_PX,
  });
}

/** Rendered line count: explicit newlines plus per-line soft-wrap by width. */
function estimateRenderedBodyLines(body: string): number {
  if (!body) return 1;
  let lines = 0;
  for (const segment of body.split('\n')) {
    lines += Math.max(
      1,
      Math.ceil(segment.length / MESSAGE_LIST_CHARS_PER_LINE),
    );
  }
  return Math.max(1, lines);
}

/**
 * TanStack Virtual row height guess before live measure. Accuracy matters most for
 * rows ABOVE the viewport: with above-viewport scroll compensation on, a close guess
 * keeps the anchor steady on scroll-up; an over-guess (the old line+length double add)
 * left gaps that read as the background flashing in before messages painted. Grouped
 * continuation rows omit avatar/header chrome and must stay well under the header floor.
 */
export function estimateMessageListRowSizePx(
  input: MessageListRowEstimateInput,
): number {
  const { groupedWithPrevious, showDaySeparatorBefore, message } = input;

  let size = groupedWithPrevious
    ? MESSAGE_LIST_GROUPED_CHROME_PX
    : MESSAGE_LIST_HEADER_CHROME_PX;
  if (showDaySeparatorBefore) size += 32;

  const body = message.contentText ?? message.content ?? '';
  const renderedLines = Math.min(
    MESSAGE_LIST_MAX_BODY_LINES,
    estimateRenderedBodyLines(body),
  );
  size += renderedLines * MESSAGE_LIST_BODY_LINE_PX;

  if (message.replyTo) size += 28;
  if (message.forwardedFrom) size += 56;
  if (message.poll) {
    size += 128 + Math.min(120, (message.poll.options?.length ?? 0) * 24);
  }

  const attachments = message.attachments ?? [];
  if (
    message.videoUrl ||
    attachments.some((attachment) => attachment.kind === 'video')
  ) {
    size += 280;
  } else if (attachments.some((attachment) => attachment.kind === 'document')) {
    size += 120;
  } else {
    // Still images AND GIFs group into one fixed 16:9 collage box; the legacy
    // single `message.imageUrl` routes through the same box. Either way reserve
    // exactly one box, independent of count or stored dimensions.
    const hasCollageMedia = attachments.some(
      (attachment) => attachment.kind === 'image' || attachment.kind === 'gif',
    );
    if (hasCollageMedia || (message.imageUrl && !attachments.length)) {
      size += CHAT_MEDIA_BOX_HEIGHT_PX + MESSAGE_MEDIA_BOX_VERTICAL_MARGIN_PX;
    }
    if ((message.stickers?.length ?? 0) > 0) {
      size += 180;
    }
  }

  for (const slot of walkImageSlots(message.contentJson)) {
    size += estimateImageSlotBlockPx(slot.aspectW, slot.aspectH);
  }

  const buttonRowCount = countButtonRows(message.contentJson);
  if (buttonRowCount > 0) {
    size += buttonRowCount * 48;
  }

  const embeds = message.embeds ?? [];
  if (embeds.some((embed) => embed.video != null)) {
    size += 240;
  } else if (embeds.some((embed) => !!embed.image?.url?.trim())) {
    size += 180;
  } else if (embeds.length > 0) {
    size += 96;
  }

  if ((message.reactions?.length ?? 0) > 0) {
    size += 36;
  }

  const minPx = groupedWithPrevious
    ? MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX
    : MESSAGE_LIST_ROW_ESTIMATE_MIN_PX;
  return Math.max(minPx, Math.min(MESSAGE_LIST_ROW_ESTIMATE_MAX_PX, size));
}
