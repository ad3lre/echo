import type { ApiErrorBody } from '@shared/types/api';
import { EchoApiError } from '@/api/echo/transport';
import { requestAppAlert } from '@/features/layout/failures/appDialogs';
import { normalizeVoiceUserMessage } from '@/features/layout/failures/voiceJoinUserMessage';
import { echoT } from '@/i18n';
import { translateApiErrorBody } from '@/i18n/apiErrors';

export function voiceJoinDeniedModalTitle(body: ApiErrorBody): string {
  const d = body.detail;
  const c = body.code;
  if (d === 'VOICE_CHANNEL_FULL' || c === 'CHANNEL_FULL') {
    return echoT('dialogs.voiceJoin.titleFull');
  }
  if (d === 'MISSING_CONNECT') {
    return echoT('dialogs.voiceJoin.titleNoConnect');
  }
  if (d === 'MISSING_VIEW_CHANNEL') {
    return echoT('dialogs.voiceJoin.titleNoView');
  }
  if (d === 'COMMUNICATION_TIMEOUT') {
    return echoT('dialogs.voiceJoin.titleTimeout');
  }
  if (d === 'BANNED_FROM_SERVER') {
    return echoT('dialogs.voiceJoin.titleBanned');
  }
  if (d === 'NOT_SERVER_MEMBER') {
    return echoT('dialogs.voiceJoin.titleNotMember');
  }
  if (d === 'VOICE_CHANNEL_NOT_FOUND') {
    return echoT('dialogs.voiceJoin.titleNotFound');
  }
  if (
    c === 'VOICE_E2EE_EPOCH_REQUIRED' ||
    c === 'VOICE_E2EE_ENVELOPE_MISSING'
  ) {
    return echoT('dialogs.voiceJoin.titleE2eeFailed');
  }
  return echoT('dialogs.voiceJoin.titleDefault');
}

export function requestGuildVoiceJoinApiDeniedModal(err: EchoApiError): void {
  const body = err.body;
  const msg = normalizeVoiceUserMessage(
    translateApiErrorBody(body) || err.message,
  );
  void requestAppAlert({
    title: voiceJoinDeniedModalTitle(body),
    message: msg,
  });
}

export function requestGuildVoiceJoinNoPermissionModal(): void {
  void requestAppAlert({
    title: echoT('dialogs.voiceJoin.titleNoConnect'),
    message: echoT('dialogs.voiceJoin.noPermissionMessage'),
  });
}

export function requestGuildVoiceDiscordMirrorModal(): void {
  void requestAppAlert({
    title: echoT('dialogs.voiceJoin.joinInDiscordTitle'),
    message: echoT('dialogs.voiceJoin.joinInDiscordMessage'),
  });
}
