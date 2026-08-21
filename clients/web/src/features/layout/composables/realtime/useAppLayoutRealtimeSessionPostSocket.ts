import { watch, type ComputedRef } from 'vue';
import { useMessageReactions } from '@/features/layout/composables/messaging/useMessageReactions';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { registerEchoToastQuickReplySender } from '@/features/layout/echoToastQuickReplyBridge';
import { updateChannelMessageInBucket } from '@/features/chat/domain/channelMessageAuthority';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { ActionResult } from '@/features/layout/actionResult';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import type { Ref } from 'vue';
import { createPinToggleHandlers } from '../messaging/createPinToggleHandlers';
import { createAppLayoutReactionSocketFallback } from './useAppLayoutReactionSocketFallback';
import { createSubmitPinToggle } from '../messaging/useAppLayoutSubmitPinToggle';
import type { useAppLayoutRealtimeSocketBinding } from './useAppLayoutRealtimeSocketBinding';

type SocketBag = ReturnType<typeof useAppLayoutRealtimeSocketBinding>;

function registerToastQuickReply(deps: {
  isLiveSocketReady: () => boolean;
  sendMessageViaSocket: SocketBag['sendMessage'];
}) {
  registerEchoToastQuickReplySender((channelId, payload) => {
    const trimmed = payload.text.trim();
    if (!trimmed) return;
    if (!deps.isLiveSocketReady()) {
      dispatchAppToast(
        'You are offline. Reconnect to send a message.',
        'warning',
      );
      return;
    }
    try {
      deps.sendMessageViaSocket(
        channelId,
        trimmed,
        payload.mentions,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        payload.contentJson,
        payload.contentSchemaVersion,
      );
    } catch {
      dispatchAppToast('Could not send message.', 'warning');
    }
  });
}

function watchOutboundPresence(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  isLiveSocketReady: () => boolean;
  syncOutboundPresence: () => void;
}) {
  watch(
    () =>
      `${deps.authSession.isAuthenticated ? '1' : '0'}:${deps.authSession.backendUser?.id ?? ''}:${deps.authSession.backendUser?.status ?? ''}`,
    () => {
      if (!deps.authSession.isAuthenticated) return;
      if (!deps.isLiveSocketReady()) return;
      deps.syncOutboundPresence();
    },
  );
}

/** Toast quick-reply, outbound presence, pin toggle, and reaction fallback. */
export function wireRealtimeSessionPostSocket(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  sendMessageViaSocket: SocketBag['sendMessage'];
  isLiveSocketReady: () => boolean;
  syncOutboundPresence: () => void;
  pinChannelId: ComputedRef<string>;
  getPinnedIdsSnapshot: (channelId: string) => string[];
  isLiveReactionReady: () => boolean;
  uiTransactions: SocketBag['uiTransactions'];
  pinMessage: (channelId: string, messageId: string) => void;
  unpinMessage: (channelId: string, messageId: string) => void;
  submitPinViaSocket: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<{ ok: boolean }>;
  submitUnpinViaSocket: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<{ ok: boolean }>;
  submitReactionToggleViaSocket: (
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  messages: Ref<Record<string, RawMessage[]>>;
}) {
  registerToastQuickReply({
    isLiveSocketReady: deps.isLiveSocketReady,
    sendMessageViaSocket: deps.sendMessageViaSocket,
  });
  watchOutboundPresence({
    authSession: deps.authSession,
    isLiveSocketReady: deps.isLiveSocketReady,
    syncOutboundPresence: deps.syncOutboundPresence,
  });

  const submitPinToggle = createSubmitPinToggle({
    pinChannelId: deps.pinChannelId,
    getPinnedIdsSnapshot: deps.getPinnedIdsSnapshot,
    isLiveReactionReady: deps.isLiveReactionReady,
    uiTransactions: deps.uiTransactions,
    pinMessage: deps.pinMessage,
    unpinMessage: deps.unpinMessage,
    submitPinViaSocket: deps.submitPinViaSocket,
    submitUnpinViaSocket: deps.submitUnpinViaSocket,
  });
  const pinToggleHandlers = createPinToggleHandlers(submitPinToggle);

  const { isReactionPersistReady, submitReactionToggle } =
    createAppLayoutReactionSocketFallback({
      authSession: deps.authSession,
      isLiveSocketReady: deps.isLiveSocketReady,
      submitReactionToggleViaSocket: deps.submitReactionToggleViaSocket,
      updateChannelMessageInBucket,
      uiTransactions: deps.uiTransactions,
    });

  const { toggleReaction: toggleReactionOnMessages } = useMessageReactions(
    deps.messages,
    {
      uiTransactions: deps.uiTransactions,
      isLiveReactionReady: isReactionPersistReady,
      emitReactionToggle: submitReactionToggle,
    },
  );

  return {
    submitPinToggle,
    pinToggleHandlers,
    isReactionPersistReady,
    submitReactionToggle,
    toggleReactionOnMessages,
  };
}
