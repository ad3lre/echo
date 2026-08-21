import { isDmCallRollupCollapseMessageId } from '@/features/chat/domain/dmCallLogHistoryCollapse';

export type MessageListBubbleActionHandlersOptions = {
  onPollVote: () => ((messageId: string, optionId: string) => void) | undefined;
  onReact: () => ((messageId: string, emoji: string) => void) | undefined;
  onPin: () => ((messageId: string) => void) | undefined;
  onUnpin: () => ((messageId: string) => void) | undefined;
};

type HandlerCaches = {
  vote: Map<string, (optId: string) => void>;
  react: Map<string, (emoji: string) => void>;
  pin: Map<string, () => void>;
  unpin: Map<string, () => void>;
};

function getVoteHandler(
  options: MessageListBubbleActionHandlersOptions,
  caches: HandlerCaches,
  messageId: string | undefined,
) {
  const onPollVote = options.onPollVote();
  if (!messageId || isDmCallRollupCollapseMessageId(messageId) || !onPollVote) {
    return undefined;
  }
  let fn = caches.vote.get(messageId);
  if (!fn) {
    fn = (optId: string) => options.onPollVote()?.(messageId, optId);
    caches.vote.set(messageId, fn);
  }
  return fn;
}

function getReactHandler(
  options: MessageListBubbleActionHandlersOptions,
  caches: HandlerCaches,
  messageId: string | undefined,
) {
  const onReact = options.onReact();
  if (!messageId || isDmCallRollupCollapseMessageId(messageId) || !onReact) {
    return undefined;
  }
  let fn = caches.react.get(messageId);
  if (!fn) {
    fn = (emoji: string) => options.onReact()?.(messageId, emoji);
    caches.react.set(messageId, fn);
  }
  return fn;
}

function getPinHandler(
  options: MessageListBubbleActionHandlersOptions,
  caches: HandlerCaches,
  messageId: string | undefined,
) {
  const onPin = options.onPin();
  if (!messageId || isDmCallRollupCollapseMessageId(messageId) || !onPin) {
    return undefined;
  }
  let fn = caches.pin.get(messageId);
  if (!fn) {
    fn = () => options.onPin()?.(messageId);
    caches.pin.set(messageId, fn);
  }
  return fn;
}

function getUnpinHandler(
  options: MessageListBubbleActionHandlersOptions,
  caches: HandlerCaches,
  messageId: string | undefined,
) {
  const onUnpin = options.onUnpin();
  if (!messageId || isDmCallRollupCollapseMessageId(messageId) || !onUnpin) {
    return undefined;
  }
  let fn = caches.unpin.get(messageId);
  if (!fn) {
    fn = () => options.onUnpin()?.(messageId);
    caches.unpin.set(messageId, fn);
  }
  return fn;
}

/**
 * Stable per-message callbacks for MessageBubble. Caches are cleared on
 * channel switch by the caller — this module does not watch channel id.
 */
export function createMessageListBubbleActionHandlers(
  options: MessageListBubbleActionHandlersOptions,
) {
  const caches: HandlerCaches = {
    vote: new Map(),
    react: new Map(),
    pin: new Map(),
    unpin: new Map(),
  };
  return {
    getVoteHandler: (messageId: string | undefined) =>
      getVoteHandler(options, caches, messageId),
    getReactHandler: (messageId: string | undefined) =>
      getReactHandler(options, caches, messageId),
    getPinHandler: (messageId: string | undefined) =>
      getPinHandler(options, caches, messageId),
    getUnpinHandler: (messageId: string | undefined) =>
      getUnpinHandler(options, caches, messageId),
    clearBubbleActionHandlers: () => {
      caches.vote.clear();
      caches.react.clear();
      caches.pin.clear();
      caches.unpin.clear();
    },
  };
}
