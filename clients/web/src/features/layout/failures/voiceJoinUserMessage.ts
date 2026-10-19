import { echoT } from '@/i18n';

/** Human-facing copy for voice join errors (API messages + light normalization). */
export function normalizeVoiceUserMessage(raw: string): string {
  const msg = raw.trim();
  if (!msg) {
    return echoT('dialogs.voiceJoin.connectFailedNetwork');
  }
  const lower = msg.toLowerCase();
  if (lower.includes('communication timeout') || lower.includes('timed out')) {
    return echoT('dialogs.voiceJoin.communicationTimeoutBlocked');
  }
  return msg;
}
