import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  buildMessageListRowFactsAtIndex,
  type MessageWithAuthorRow,
} from '@/features/chat/presentation/messageListRowFacts';
import { buildMessageWithAuthor } from '@/features/chat/viewModel/messageWithAuthor';
import {
  isEchoMessageRead,
  resolveEchoMessageReadStateForMessageList,
  resolveEchoMessageReadStateFromBoundary,
  type EchoMessageReadState,
} from '@/services/domain/echoMessageReadState';

/**
 * Neighbor / list-edge flags — precomputed in the list view model, not inferred in the bubble.
 * Grouping is **not** decided in the render path; see `@/features/chat/domain/viewportContract`.
 */
export interface MessageListRowLayoutFlags {
  groupedWithPrevious: boolean;
  groupedWithNext: boolean;
  isFirstInList: boolean;
  isLastInList: boolean;
}

/**
 * Single row input for the message list item: message + layout + reply preview.
 * Built in {@link buildMessageListRowPresentationAtIndex} from ordered ids and maps.
 */
export interface MessageListRowPresentation {
  message: MessageWithAuthorRow;
  showAvatar: boolean;
  /** Inline timestamp in the header row (MessageHeader). */
  showHeaderTimestamp: boolean;
  /** Continuation row: gutter hover short time */
  showGutterHoverTime: boolean;
  showDaySeparatorBefore: boolean;
  daySeparatorLabel: string;
  replyPreview: MessageWithAuthorRow | undefined;
  /** List padding mode (e.g. voice side chat) */
  isCompact: boolean;
  readState: EchoMessageReadState;
  showUnreadSeparatorBefore: boolean;
  layout: MessageListRowLayoutFlags;
}

export function buildMessageListRowPresentationAtIndex(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
  compactTop: boolean,
  firstUnreadMessageId: string | null | undefined,
  lastReadMessageId: string | null | undefined,
  index: number,
  /** When false, omit the “New” unread divider (e.g. server text channels). Default true (DMs). */
  showUnreadSeparator = true,
): MessageListRowPresentation {
  const facts = buildMessageListRowFactsAtIndex(
    orderedIds,
    messagesMap,
    entitiesById,
    compactTop,
    index,
  );
  const id = orderedIds[index];
  if (!id) {
    throw new Error(
      `buildMessageListRowPresentationAtIndex: missing id at index ${index}`,
    );
  }
  const entity = entitiesById.get(id);
  if (!entity) {
    throw new Error(
      `buildMessageListRowPresentationAtIndex: missing entity for id at index ${index}`,
    );
  }
  let message = messagesMap.get(id);
  if (!message) {
    // Authority can expose entities before the author map catches up on channel switch / refresh.
    message = buildMessageWithAuthor(
      entity,
      new Map(),
      {},
    ) as MessageWithAuthorRow;
  }
  const n = orderedIds.length;
  const lr = lastReadMessageId?.trim() ?? '';
  const lastReadAnchor = lr ? entitiesById.get(lr) : undefined;
  const readState = resolveEchoMessageReadStateForMessageList({
    messageEntity: entity,
    lastReadMessageId,
    lastReadAnchorEntity: lastReadAnchor,
    firstUnreadMessageId,
  });
  const previousMessageId = index > 0 ? (orderedIds[index - 1] ?? null) : null;
  const previousEntity =
    previousMessageId != null ? entitiesById.get(previousMessageId) : undefined;
  const previousReadState =
    previousMessageId == null
      ? 'read'
      : previousEntity
        ? resolveEchoMessageReadStateForMessageList({
            messageEntity: previousEntity,
            lastReadMessageId,
            lastReadAnchorEntity: lastReadAnchor,
            firstUnreadMessageId,
          })
        : lr
          ? isEchoMessageRead(lr, previousMessageId)
            ? 'read'
            : 'unread'
          : resolveEchoMessageReadStateFromBoundary({
              firstUnreadMessageId,
              messageId: previousMessageId,
            });
  return {
    message,
    showAvatar: facts.showAvatar,
    showHeaderTimestamp: facts.showHeaderTimestamp,
    showGutterHoverTime: facts.showGutterHoverTime,
    showDaySeparatorBefore: facts.showDaySeparatorBefore,
    daySeparatorLabel: facts.daySeparatorLabel,
    replyPreview: facts.replyTargetResolved,
    isCompact: facts.compactTop,
    readState,
    showUnreadSeparatorBefore:
      showUnreadSeparator &&
      readState === 'unread' &&
      previousReadState === 'read' &&
      message.systemMessage !== true,
    layout: {
      groupedWithPrevious: facts.groupedWithPrevious,
      groupedWithNext: facts.groupedWithNext,
      isFirstInList: index === 0,
      isLastInList: index === n - 1 && n > 0,
    },
  };
}

export function buildMessageListRowPresentations(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthorRow>,
  entitiesById: ReadonlyMap<string, RawMessage>,
  compactTop: boolean,
  firstUnreadMessageId: string | null | undefined,
  lastReadMessageId: string | null | undefined = undefined,
  showUnreadSeparator = true,
): MessageListRowPresentation[] {
  const n = orderedIds.length;
  const out: MessageListRowPresentation[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(
      buildMessageListRowPresentationAtIndex(
        orderedIds,
        messagesMap,
        entitiesById,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        i,
        showUnreadSeparator,
      ),
    );
  }
  return out;
}
