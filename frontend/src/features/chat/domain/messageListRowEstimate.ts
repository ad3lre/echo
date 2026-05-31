import type { MessageWithAuthor } from '@shared/types';

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
  >;
};

/**
 * TanStack Virtual row height guess before live measure. Grouped continuation rows
 * must not inherit the header minimum — over-estimation leaves visible gaps between
 * clustered messages until (and if) measure catches up.
 */
export function estimateMessageListRowSizePx(
  input: MessageListRowEstimateInput,
): number {
  const { groupedWithPrevious, showDaySeparatorBefore, message } = input;

  let size = groupedWithPrevious ? 34 : 78;
  if (showDaySeparatorBefore) size += 32;

  const body = message.contentText ?? message.content ?? '';
  const lineCount = Math.max(1, body.split('\n').length);
  if (groupedWithPrevious) {
    // Continuation rows omit avatar/header; avoid stacking line + length heuristics.
    size += Math.max(0, lineCount - 1) * 20;
    if (body.length > 90) {
      size += Math.min(120, Math.ceil(body.length / 90) * 18);
    }
  } else {
    size += Math.min(5, lineCount) * 18;
    size += Math.min(120, Math.ceil(body.length / 90) * 18);
  }

  if (message.replyTo) size += 28;
  if (message.forwardedFrom) size += 24;
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
  } else if (
    message.imageUrl ||
    message.gif ||
    (message.stickers?.length ?? 0) > 0 ||
    attachments.some(
      (attachment) => attachment.kind === 'image' || attachment.kind === 'gif',
    )
  ) {
    size += 240;
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
