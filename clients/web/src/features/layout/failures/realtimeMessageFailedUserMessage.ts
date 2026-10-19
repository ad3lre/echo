import type { MessageFailedCode } from '@shared/types';
import { echoT } from '@/i18n';

/**
 * User-visible copy for `message_failed` Socket.IO payloads (edits, reactions, pins, etc.).
 * Keep in sync with server `MessageFailedCode` values in shared/types/socket.ts.
 */
export function realtimeMessageFailedUserMessage(
  code: MessageFailedCode,
  rawDetail: string,
): string {
  const d = rawDetail.trim();
  switch (code) {
    case 'RATE_LIMIT':
      return echoT('dialogs.messageFailed.rateLimit');
    case 'SLOWMODE':
      return echoT('dialogs.messageFailed.slowmode');
    case 'SPAM_FILTER':
      return d || echoT('dialogs.messageFailed.spamFilter');
    case 'FORBIDDEN':
      if (
        d.toLowerCase().includes('communication timeout') ||
        d.toLowerCase().includes('timed out')
      ) {
        return echoT('dialogs.messageFailed.communicationTimeout');
      }
      if (
        d.toLowerCase().includes('@everyone') ||
        d.toLowerCase().includes('@active')
      ) {
        return echoT('dialogs.messageFailed.mentionBroadcastForbidden');
      }
      return echoT('dialogs.messageFailed.forbidden');
    case 'UNAUTHENTICATED':
      return echoT('dialogs.messageFailed.unauthenticated');
    case 'PERSIST_FAILED':
      return echoT('dialogs.messageFailed.persistFailed');
    case 'E2EE_STORAGE_UNAVAILABLE':
      return d || echoT('dialogs.messageFailed.e2eeStorageUnavailable');
    case 'E2EE_UNKNOWN_DEVICE':
      return d || echoT('dialogs.messageFailed.e2eeUnknownDevice');
    case 'E2EE_DEVICE_REVOKED':
      return d || echoT('dialogs.messageFailed.e2eeDeviceRevoked');
    case 'E2EE_ENVELOPE_TOO_LARGE':
      return d || echoT('dialogs.messageFailed.e2eeEnvelopeTooLarge');
    case 'VALIDATION':
      return d || echoT('dialogs.messageFailed.validation');
    case 'UNKNOWN_CHANNEL':
      return echoT('dialogs.messageFailed.unknownChannel');
    case 'IDEMPOTENCY_EXPIRED':
      return echoT('dialogs.messageFailed.idempotencyExpired');
    case 'GUEST_LIMIT':
      return d || echoT('dialogs.messageFailed.guestLimit');
    case 'GUEST_ABUSE_COOLDOWN':
      return d || echoT('dialogs.messageFailed.guestAbuseCooldown');
    default:
      return d || echoT('dialogs.messageFailed.default');
  }
}
