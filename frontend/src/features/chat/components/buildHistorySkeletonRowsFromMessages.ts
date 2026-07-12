import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { isMessageGroupedWithPrevious } from '@/features/chat/viewModel/messageListGrouping';
import { messagePreviewPlainText } from '@/services/domain/messagePreviewPlain';
import type { MessageWithAuthor } from '@shared/types';
import { walkImageSlots } from '@shared/imageSlotContentJson';
import { countButtonRows } from '@shared/buttonRowContentJson';
import {
  formatMessageListDaySeparatorLabel,
  shouldShowDaySeparatorBefore,
} from '@/features/chat/presentation/messageListRowFacts';
import {
  HISTORY_SKELETON_MEDIA_BLOCK,
  HISTORY_SKELETON_ROWS,
  historySkeletonImageSlotBlock,
  type HistorySkeletonImageBlock,
  type HistorySkeletonRow,
} from './messageListHistorySkeleton';

const MAX_SKELETON_ROWS = HISTORY_SKELETON_ROWS.length;
const POLL_BASE_SKELETON_HEIGHT_PX = 128;
const POLL_OPTION_SKELETON_HEIGHT_PX = 24;
const POLL_MAX_OPTIONS_HEIGHT_PX = 120;
const BUTTON_ROW_SKELETON_HEIGHT_PX = 48;

function nameWidthClass(nameLen: number): string {
  if (nameLen <= 6) return 'w-16';
  if (nameLen <= 10) return 'w-20';
  if (nameLen <= 14) return 'w-24';
  if (nameLen <= 18) return 'w-28';
  return 'w-32';
}

function lineWidthClass(charCount: number): string {
  const pct = Math.min(95, Math.max(28, Math.round((charCount / 72) * 100)));
  return `w-[min(${pct}%,26rem)]`;
}

function splitPreviewLines(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [lineWidthClass(12)];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 72 && current) {
      lines.push(lineWidthClass(current.length));
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(lineWidthClass(current.length));
  return lines.length > 0 ? lines.slice(0, 4) : [lineWidthClass(12)];
}

function imageBlocksForMessage(
  msg: RawMessage,
): HistorySkeletonImageBlock[] | undefined {
  const blocks: HistorySkeletonImageBlock[] = [];
  const attachment = msg.attachments?.[0];
  if (
    attachment?.kind === 'image' ||
    attachment?.kind === 'gif' ||
    msg.imageUrl ||
    msg.gif
  ) {
    blocks.push(HISTORY_SKELETON_MEDIA_BLOCK);
  } else if (attachment?.kind === 'video' || msg.videoUrl) {
    const width = attachment?.width;
    const height = attachment?.height;
    if (width && height && width > 0 && height > 0) {
      blocks.push({ aspectW: width, aspectH: height });
    } else {
      blocks.push(HISTORY_SKELETON_MEDIA_BLOCK);
    }
  }
  for (const slot of walkImageSlots(msg.contentJson)) {
    blocks.push(historySkeletonImageSlotBlock(slot.aspectW, slot.aspectH));
  }
  return blocks.length > 0 ? blocks.slice(0, 2) : undefined;
}

function blockHeightsForMessage(msg: RawMessage): number[] | undefined {
  const heights: number[] = [];
  if (msg.poll) {
    const optionCount = msg.poll.options?.length ?? 0;
    heights.push(
      POLL_BASE_SKELETON_HEIGHT_PX +
        Math.min(
          POLL_MAX_OPTIONS_HEIGHT_PX,
          optionCount * POLL_OPTION_SKELETON_HEIGHT_PX,
        ),
    );
  }
  const buttonRowCount = countButtonRows(msg.contentJson);
  if (buttonRowCount > 0) {
    heights.push(buttonRowCount * BUTTON_ROW_SKELETON_HEIGHT_PX);
  }
  return heights.length > 0 ? heights : undefined;
}

function toGroupingMap(
  messages: readonly RawMessage[],
): Map<string, MessageWithAuthor> {
  const map = new Map<string, MessageWithAuthor>();
  for (const msg of messages) {
    const id = msg.id?.trim();
    if (!id) continue;
    map.set(id, {
      id,
      authorId: msg.authorId,
      timestamp: msg.timestamp,
      content: msg.content,
      systemMessage: msg.systemMessage,
      replyTo: msg.replyTo,
    } as MessageWithAuthor);
  }
  return map;
}

/**
 * Derive skeleton rows from cached message snapshots so loading placeholders
 * mirror real author grouping, line lengths, and attachment aspect boxes.
 */
export type BuildHistorySkeletonRowsOptions = {
  /** `tail` mirrors the newest messages (initial load); `head` mirrors the oldest in-window rows (scroll-up). */
  edge?: 'head' | 'tail';
};

export function buildHistorySkeletonRowsFromMessages(
  messages: readonly RawMessage[],
  resolveAuthorName?: (authorId: string) => string,
  options?: BuildHistorySkeletonRowsOptions,
): HistorySkeletonRow[] {
  if (messages.length === 0) return HISTORY_SKELETON_ROWS;

  const edge = options?.edge ?? 'tail';
  const tail =
    edge === 'head'
      ? messages.slice(0, MAX_SKELETON_ROWS)
      : messages.slice(-MAX_SKELETON_ROWS);
  const orderedIds = tail.map((m) => m.id!).filter(Boolean);
  const entitiesById = new Map(tail.map((m) => [m.id!, m]));
  const groupingMap = toGroupingMap(tail);
  const rows: HistorySkeletonRow[] = [];

  for (let i = 0; i < tail.length; i++) {
    const msg = tail[i]!;
    const grouped = isMessageGroupedWithPrevious(
      orderedIds,
      groupingMap,
      i,
      entitiesById,
    );
    const showDaySeparator = shouldShowDaySeparatorBefore(
      orderedIds,
      groupingMap,
      i,
    );
    const daySeparatorLabel = showDaySeparator
      ? formatMessageListDaySeparatorLabel(msg.timestamp)
      : undefined;
    const preview = messagePreviewPlainText(msg, 220);
    const lineWidths = splitPreviewLines(preview);
    const imageBlocks = imageBlocksForMessage(msg);
    const blockHeights = blockHeightsForMessage(msg);
    if (grouped) {
      rows.push({
        grouped: true,
        ...(daySeparatorLabel ? { daySeparatorLabel } : {}),
        lineWidths,
        ...(imageBlocks ? { imageBlocks } : {}),
        ...(blockHeights ? { blockHeights } : {}),
      });
      continue;
    }
    const authorName =
      resolveAuthorName?.(msg.authorId) ??
      msg.authorDisplayName?.trim() ??
      'Member';
    rows.push({
      grouped: false,
      ...(daySeparatorLabel ? { daySeparatorLabel } : {}),
      nameWidth: nameWidthClass(authorName.length),
      timeWidth: 'w-10',
      lineWidths,
      ...(imageBlocks ? { imageBlocks } : {}),
      ...(blockHeights ? { blockHeights } : {}),
      ...(rows.length > 0 &&
      !rows[rows.length - 1]?.grouped &&
      !daySeparatorLabel
        ? { clustered: true }
        : {}),
    });
  }

  return rows.length > 0 ? rows : HISTORY_SKELETON_ROWS;
}
