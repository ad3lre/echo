import type { MessageFailedCode } from '@shared/types';

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
      return 'Too many actions. Wait a moment and try again.';
    case 'SLOWMODE':
      return 'Slowmode is on for this channel. Wait before editing or sending.';
    case 'SPAM_FILTER':
      return d || 'Spam filter blocked that message. Wait a bit and try again.';
    case 'FORBIDDEN':
      if (
        d.toLowerCase().includes('communication timeout') ||
        d.toLowerCase().includes('timed out')
      ) {
        return 'You are in a communication timeout in this server.';
      }
      if (
        d.toLowerCase().includes('@everyone') ||
        d.toLowerCase().includes('@active')
      ) {
        return 'You cannot mention @everyone or @active in this channel.';
      }
      return "You don't have permission to do that.";
    case 'UNAUTHENTICATED':
      return 'Sign in again, then retry.';
    case 'PERSIST_FAILED':
      return 'Echo could not save your change. Try again.';
    case 'E2EE_STORAGE_UNAVAILABLE':
      return (
        d ||
        'Private message storage is not available on this server yet. Regular messages still work.'
      );
    case 'E2EE_UNKNOWN_DEVICE':
      return (
        d ||
        'This device is not set up for private messages. Check Settings → Account.'
      );
    case 'E2EE_DEVICE_REVOKED':
      return d || 'This device was removed from private messaging.';
    case 'E2EE_ENVELOPE_TOO_LARGE':
      return d || 'That private message was too large to send.';
    case 'VALIDATION':
      return d || 'That change was rejected.';
    case 'UNKNOWN_CHANNEL':
      return 'This channel is no longer available.';
    case 'IDEMPOTENCY_EXPIRED':
      return 'That action expired. Try again.';
    case 'GUEST_LIMIT':
    case 'GUEST_ABUSE_COOLDOWN':
      return d || 'Action temporarily blocked. Try again later.';
    default:
      return d || "Something didn't work. Try again.";
  }
}
