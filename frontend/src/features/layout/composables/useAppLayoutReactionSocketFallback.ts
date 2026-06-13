import { echoHttpToggleReaction } from '@/api/echo/echoReactionHttp';
import type { useAuthSessionStore } from '@/stores/authSession';
import { updateChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { failResult, type ActionResult } from '@/types/actionResult';

export function createAppLayoutReactionSocketFallback(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  isLiveSocketReady: () => boolean;
  submitReactionToggleViaSocket: (
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  updateChannelMessageInBucket: typeof updateChannelMessageInBucket;
  uiTransactions: {
    commitPendingReactionTogglesForMessage: (
      channelId: string,
      messageId: string,
    ) => void;
  };
}): {
  isReactionPersistReady: () => boolean;
  submitReactionToggle: (
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
    ctx?: { removing: boolean },
  ) => Promise<ActionResult>;
} {
  function isReactionPersistReady(): boolean {
    return deps.isLiveSocketReady() || deps.authSession.isAuthenticated;
  }

  async function submitReactionToggle(
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
    ctx?: { removing: boolean },
  ): Promise<ActionResult> {
    if (deps.isLiveSocketReady()) {
      return deps.submitReactionToggleViaSocket(
        channelId,
        messageId,
        emoji,
        correlationId,
      );
    }
    if (!deps.authSession.isAuthenticated) {
      return failResult(
        'SOCKET_DISCONNECTED',
        'Realtime is not connected. Wait for Echo to reconnect, then try again.',
        true,
      );
    }
    if (ctx?.removing === undefined) {
      return failResult(
        'SOCKET_DISCONNECTED',
        'Realtime is not connected. Wait for Echo to reconnect, then try again.',
        true,
      );
    }
    const r = await echoHttpToggleReaction({
      token: deps.authSession.accessToken,
      channelId,
      messageId,
      emoji,
      removing: ctx.removing,
    });
    if (!r.ok) return r;
    if (r.reactions) {
      deps.updateChannelMessageInBucket(channelId, messageId, {
        reactions: r.reactions.length > 0 ? r.reactions : undefined,
      });
      deps.uiTransactions.commitPendingReactionTogglesForMessage(
        channelId,
        messageId,
      );
    }
    return { ok: true };
  }

  return { isReactionPersistReady, submitReactionToggle };
}
