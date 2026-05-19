import type { IncomingChatMessageNotifyDetail } from '@/audio/incomingChatMessageNotifyDetail';
import { ECHO_INCOMING_CHAT_MESSAGE_EVENT } from '@/audio/echoSoundEvents';

export type EchoRealtimeBrowserEvents = {
  notifyIncomingChatMessage: (detail: IncomingChatMessageNotifyDetail) => void;
  dispatchEchoMessageFailed: (detail: unknown) => void;
};

function noop() {}

/**
 * Browser-only UI side effects for realtime.
 * Kept out of socket wiring so the transport/domain seams stay platform-agnostic.
 */
export function defaultEchoRealtimeBrowserEvents(): EchoRealtimeBrowserEvents {
  if (typeof window === 'undefined') {
    return {
      notifyIncomingChatMessage: noop,
      dispatchEchoMessageFailed: noop,
    };
  }

  return {
    notifyIncomingChatMessage: (detail) => {
      window.dispatchEvent(
        new CustomEvent(ECHO_INCOMING_CHAT_MESSAGE_EVENT, { detail }),
      );
    },
    dispatchEchoMessageFailed: (detail) => {
      window.dispatchEvent(new CustomEvent('echo-message-failed', { detail }));
    },
  };
}
