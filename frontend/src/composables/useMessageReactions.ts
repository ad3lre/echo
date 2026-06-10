import type { Ref } from 'vue';
import type { MessageReaction } from '@shared/types';
import { sortMessageReactionsForDisplay } from '@shared/types';
import type { ActionResult } from '@/types/actionResult';
import { failResult, okResult } from '@/types/actionResult';
import { propagateActionFailure } from '@/utils/actionFailurePropagation';
import {
  newUiCorrelationId,
  type UiTransactionManager,
} from '@/ui/transactions/TransactionManager';
import type { RawMessage } from './useChatMessages';
import { updateChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';

export function useMessageReactions(
  messages: Ref<Record<string, RawMessage[]>>,
  options?: {
    emitReactionToggle?: (
      channelId: string,
      messageId: string,
      emoji: string,
      correlationId: string,
      /** Pre-optimistic intent: whether this toggle removes the caller’s reaction. */
      ctx?: { removing: boolean },
    ) => void | ActionResult | Promise<ActionResult | void>;
    uiTransactions?: UiTransactionManager;
    isLiveReactionReady?: () => boolean;
  },
) {
  function applyOptimisticToggle(
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ): boolean {
    const channelMessages = messages.value[channelId];
    if (!channelMessages) return false;
    const msgIdx = channelMessages.findIndex((m) => m.id === messageId);
    if (msgIdx < 0) return false;

    const msg = channelMessages[msgIdx]!;
    const reactions = [...(msg.reactions ?? [])];
    const existing = reactions.find((r) => r.emoji === emoji);

    const nowIso = new Date().toISOString();
    let nextReactions: MessageReaction[];

    if (existing) {
      const hasReacted = existing.userIds.includes(userId);
      if (hasReacted) {
        const nextUserIds = existing.userIds.filter((id) => id !== userId);
        if (nextUserIds.length === 0) {
          nextReactions = reactions.filter((r) => r.emoji !== emoji);
        } else {
          nextReactions = reactions.map((r) =>
            r.emoji === emoji
              ? { ...r, userIds: nextUserIds, count: nextUserIds.length }
              : r,
          );
        }
      } else {
        nextReactions = reactions.map((r) =>
          r.emoji === emoji
            ? {
                ...r,
                userIds: [...r.userIds, userId],
                count: r.count + 1,
              }
            : r,
        );
      }
    } else {
      nextReactions = [
        ...reactions,
        { emoji, count: 1, userIds: [userId], firstReactionAt: nowIso },
      ];
    }

    const ordered =
      sortMessageReactionsForDisplay(nextReactions) ?? nextReactions;

    /**
     * Must go through `ChannelMessageIndex.update` so `byId` and the materialized
     * bucket stay aligned. MessageList fingerprints read `entitiesById` (from `byId`);
     * swapping only `messages[channelId][i]` left stale entities and skipped row refresh.
     */
    const { updated } = updateChannelMessageInBucket(channelId, messageId, {
      reactions: ordered.length > 0 ? ordered : undefined,
    });
    return updated;
  }

  async function toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<boolean> {
    const emit = options?.emitReactionToggle;
    if (emit) {
      if (!options?.isLiveReactionReady?.()) {
        const fr = failResult(
          'SOCKET_DISCONNECTED',
          'Realtime is not connected. Wait for Echo to reconnect, then try again.',
          true,
        );
        propagateActionFailure(fr, {
          flow: 'socket.reaction_toggle',
          context: 'reaction_toggle',
        });
        return false;
      }

      const channelMessages = messages.value[channelId];
      if (!channelMessages) return false;
      const msgIdx = channelMessages.findIndex((m) => m.id === messageId);
      if (msgIdx < 0) return false;
      const msg = channelMessages[msgIdx]!;
      const correlationId = newUiCorrelationId();
      const previousReactions = msg.reactions?.map((r) => ({
        ...r,
        userIds: [...r.userIds],
      }));
      const removing = !!msg.reactions
        ?.find((r) => r.emoji === emoji)
        ?.userIds.includes(userId);

      options.uiTransactions?.beginTransaction({
        id: correlationId,
        type: 'reaction-toggle',
        state: 'pending',
        channelId,
        messageId,
        correlationId,
        previousReactions,
      });

      applyOptimisticToggle(channelId, messageId, emoji, userId);

      const raw = emit(channelId, messageId, emoji, correlationId, {
        removing,
      }) as void | ActionResult | Promise<ActionResult | void>;
      let result: ActionResult = okResult();
      if (raw !== undefined) {
        const resolved = await raw;
        if (
          resolved !== undefined &&
          typeof resolved === 'object' &&
          'ok' in resolved
        ) {
          result = resolved as ActionResult;
        }
      }
      if (!result.ok) {
        options.uiTransactions?.rollbackTransaction(correlationId);
        propagateActionFailure(result, {
          flow: 'socket.reaction_toggle',
          context: 'reaction_toggle',
        });
        return false;
      }
      return true;
    }

    return applyOptimisticToggle(channelId, messageId, emoji, userId);
  }

  return { toggleReaction };
}
