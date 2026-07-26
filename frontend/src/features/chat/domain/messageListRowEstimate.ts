import type { Embed, MessageWithAuthor } from '@shared/types';
import { stubVideoEmbedsFromMessage } from '@shared/linkEmbedCandidates';
import { walkImageSlots } from '@shared/imageSlotContentJson';
import { countButtonRows } from '@shared/buttonRowContentJson';
import { resolvePlayableVideoEmbed } from '@shared/videoEmbedIds';
import { reserveChatAttachmentMediaBoxHeightPx } from '@/features/chat/domain/messageMediaReservation';
import { estimateMessageBodyHeightPx } from '@/features/chat/domain/messageBodyEmojiGeometry';
import { plainTextForMessageFields } from '@/services/domain/messageDisplayPlain';
import {
  CHAT_IMAGE_SLOT_MAX_WIDTH_PX,
  estimateChatBitmapBlockPx,
} from '@/utils/chatMediaAspect';

export const MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX = 88;
export const MESSAGE_LIST_ROW_ESTIMATE_MIN_PX = 64;
/** Continuation rows are avatar-less and much shorter than headers. */
export const MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX = 28;
/** Tall embed stacks (video + body + day separator) can exceed the old 520px cap. */
export const MESSAGE_LIST_ROW_ESTIMATE_MAX_PX = 840;
/** 16:9 player at the compact in-chat max width (~420px). */
const MESSAGE_LIST_EMBED_VIDEO_PLAYER_PX = 236;
/** Provider, title, description chrome above rich embed media. */
const MESSAGE_LIST_EMBED_RICH_HEADER_PX = 120;
/** OG image without stored dimensions (max-h 36rem capped for estimate). */
const MESSAGE_LIST_EMBED_IMAGE_UNDIM_PX = 280;
const MESSAGE_LIST_EMBED_COMPACT_PX = 96;
const MESSAGE_LIST_EMBED_STACK_GAP_PX = 10;
const MESSAGE_LIST_EMBED_RICH_MAX_WIDTH_PX = 576;

export type MessageListRowEstimateInput = {
  groupedWithPrevious: boolean;
  showDaySeparatorBefore: boolean;
  /** Unread "New" separator — same chrome budget as the day separator. */
  showUnreadSeparatorBefore?: boolean;
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

/** Header chrome: group margin-top + vertical padding + author/timestamp row. */
const MESSAGE_LIST_HEADER_CHROME_PX = 50;
/** Continuation chrome: just the tight `.msg-continuation` vertical padding. */
const MESSAGE_LIST_GROUPED_CHROME_PX = 6;
/** Matches `MessageImageSlot` max width at 16px root (`36rem`). */
const MESSAGE_IMAGE_SLOT_MAX_WIDTH_PX = CHAT_IMAGE_SLOT_MAX_WIDTH_PX;
/** Matches `MessageImageSlot` vertical margin (`my-2`). */
const MESSAGE_IMAGE_SLOT_VERTICAL_MARGIN_PX = 16;

function estimateImageSlotBlockPx(aspectW: number, aspectH: number): number {
  return estimateChatBitmapBlockPx(aspectW, aspectH, {
    maxWidthPx: MESSAGE_IMAGE_SLOT_MAX_WIDTH_PX,
    verticalMarginPx: MESSAGE_IMAGE_SLOT_VERTICAL_MARGIN_PX,
  });
}

function embedReservesRichVideoPlayer(embed: Embed): boolean {
  const v = embed.video;
  if (v?.embedUrl?.trim() && (v.kind === 'youtube' || v.kind === 'vimeo')) {
    return true;
  }
  return resolvePlayableVideoEmbed(embed) != null;
}

function linkEmbedsForEstimate(
  message: MessageListRowEstimateInput['message'],
): Embed[] {
  const stored = message.embeds ?? [];
  if (stored.some((embed) => embed && !embed.echoJump)) return stored;
  const body = plainTextForMessageFields(message);
  const stubs = stubVideoEmbedsFromMessage(body, message.contentJson);
  return stubs.length > 0 ? stubs : stored;
}

function estimateLinkEmbedBlockPx(embed: Embed): number {
  if (embedReservesRichVideoPlayer(embed)) {
    let block =
      MESSAGE_LIST_EMBED_RICH_HEADER_PX + MESSAGE_LIST_EMBED_VIDEO_PLAYER_PX;
    const desc = embed.description?.trim();
    if (desc) {
      block += Math.min(96, Math.ceil(desc.length / 90) * 16);
    }
    const fieldCount = embed.fields?.length ?? 0;
    if (fieldCount > 0) {
      block += Math.min(140, fieldCount * 32);
    }
    return block;
  }

  const imageUrl = embed.image?.url?.trim();
  if (imageUrl) {
    const w = embed.image?.width;
    const h = embed.image?.height;
    if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) {
      const displayW = Math.min(w, MESSAGE_LIST_EMBED_RICH_MAX_WIDTH_PX);
      const displayH = Math.min(
        MESSAGE_LIST_EMBED_RICH_MAX_WIDTH_PX,
        Math.round((displayW / w) * h),
      );
      return MESSAGE_LIST_EMBED_RICH_HEADER_PX + displayH;
    }
    return (
      MESSAGE_LIST_EMBED_RICH_HEADER_PX + MESSAGE_LIST_EMBED_IMAGE_UNDIM_PX
    );
  }

  return MESSAGE_LIST_EMBED_COMPACT_PX;
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
  const {
    groupedWithPrevious,
    showDaySeparatorBefore,
    showUnreadSeparatorBefore,
    message,
  } = input;

  let size = groupedWithPrevious
    ? MESSAGE_LIST_GROUPED_CHROME_PX
    : MESSAGE_LIST_HEADER_CHROME_PX;
  if (showDaySeparatorBefore) size += 32;
  if (showUnreadSeparatorBefore) size += 32;

  const body = plainTextForMessageFields(message);
  size += estimateMessageBodyHeightPx(body);

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
      size += reserveChatAttachmentMediaBoxHeightPx();
    }
    if ((message.stickers?.length ?? 0) > 0) {
      // Same SSOT as collage / reserved GifImage shells (not a flat 180 under-guess).
      size += reserveChatAttachmentMediaBoxHeightPx();
    }
  }

  for (const slot of walkImageSlots(message.contentJson)) {
    size += estimateImageSlotBlockPx(slot.aspectW, slot.aspectH);
  }

  const buttonRowCount = countButtonRows(message.contentJson);
  if (buttonRowCount > 0) {
    size += buttonRowCount * 48;
  }

  const embeds = linkEmbedsForEstimate(message);
  for (let i = 0; i < embeds.length; i++) {
    if (embeds[i]?.echoJump) continue;
    if (i > 0) size += MESSAGE_LIST_EMBED_STACK_GAP_PX;
    size += estimateLinkEmbedBlockPx(embeds[i]!);
  }

  if ((message.reactions?.length ?? 0) > 0) {
    size += 36;
  }

  const minPx = groupedWithPrevious
    ? MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX
    : MESSAGE_LIST_ROW_ESTIMATE_MIN_PX;
  return Math.max(minPx, Math.min(MESSAGE_LIST_ROW_ESTIMATE_MAX_PX, size));
}
