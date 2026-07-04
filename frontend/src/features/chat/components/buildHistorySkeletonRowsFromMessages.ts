import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { isMessageGroupedWithPrevious } from '@/features/chat/viewModel/messageListGrouping';
import { messagePreviewPlainText } from '@/services/domain/messagePreviewPlain';
import type { MessageWithAuthor } from '@shared/types';
import {
  HISTORY_SKELETON_ROWS,
  type HistorySkeletonImageBlock,
  type HistorySkeletonRow,
} from './messageListHistorySkeleton';

const MAX_SKELETON_ROWS = HISTORY_SKELETON_ROWS.length;

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
  const attachment = msg.attachments?.[0];
  const width = attachment?.width;
  const height = attachment?.height;
  if (width && height && width > 0 && height > 0) {
    return [{ aspectW: width, aspectH: height }];
  }
  if (msg.imageUrl || msg.gif || msg.videoUrl) {
    return [{ aspectW: 16, aspectH: 9 }];
  }
  return undefined;
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
export function buildHistorySkeletonRowsFromMessages(
  messages: readonly RawMessage[],
  resolveAuthorName?: (authorId: string) => string,
): HistorySkeletonRow[] {
  if (messages.length === 0) return HISTORY_SKELETON_ROWS;

  const tail = messages.slice(-MAX_SKELETON_ROWS);
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
    const preview = messagePreviewPlainText(msg, 220);
    const lineWidths = splitPreviewLines(preview);
    const imageBlocks = imageBlocksForMessage(msg);
    if (grouped) {
      rows.push({
        grouped: true,
        lineWidths,
        ...(imageBlocks ? { imageBlocks } : {}),
      });
      continue;
    }
    const authorName =
      resolveAuthorName?.(msg.authorId) ??
      msg.authorDisplayName?.trim() ??
      'Member';
    rows.push({
      grouped: false,
      nameWidth: nameWidthClass(authorName.length),
      timeWidth: 'w-10',
      lineWidths,
      ...(imageBlocks ? { imageBlocks } : {}),
      ...(rows.length > 0 && !rows[rows.length - 1]?.grouped
        ? { clustered: true }
        : {}),
    });
  }

  return rows.length > 0 ? rows : HISTORY_SKELETON_ROWS;
}
