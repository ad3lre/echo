import type { ApiErrorBody } from '@shared/types/api';
import { EchoApiError } from '@/api/echo/transport';
import { requestAppAlert } from '@/utils/appDialogs';
import { normalizeVoiceUserMessage } from '@/utils/voiceJoinUserMessage';

export function voiceJoinDeniedModalTitle(body: ApiErrorBody): string {
  const d = body.detail;
  const c = body.code;
  if (d === 'VOICE_CHANNEL_FULL' || c === 'CHANNEL_FULL') {
    return 'Voice channel full';
  }
  if (d === 'MISSING_CONNECT') {
    return 'Cannot connect to voice';
  }
  if (d === 'MISSING_VIEW_CHANNEL') {
    return 'Channel not available';
  }
  if (d === 'COMMUNICATION_TIMEOUT') {
    return 'Communication timeout';
  }
  if (d === 'BANNED_FROM_SERVER') {
    return 'Cannot use voice';
  }
  if (d === 'NOT_SERVER_MEMBER') {
    return 'Not a member';
  }
  if (d === 'VOICE_CHANNEL_NOT_FOUND') {
    return 'Voice channel unavailable';
  }
  return 'Could not join voice';
}

/** Modal when REST/LiveKit-session returns a structured voice denial (full, perms, etc.). */
export function requestGuildVoiceJoinApiDeniedModal(err: EchoApiError): void {
  const body = err.body;
  const msg = normalizeVoiceUserMessage(body.message || err.message);
  void requestAppAlert({
    title: voiceJoinDeniedModalTitle(body),
    message: msg,
  });
}

export function requestGuildVoiceJoinNoPermissionModal(): void {
  void requestAppAlert({
    title: 'Cannot connect to voice',
    message: 'You do not have permission to connect to this voice channel.',
  });
}

export function requestGuildVoiceDiscordMirrorModal(): void {
  void requestAppAlert({
    title: 'Join in Discord',
    message:
      'This channel mirrors Discord voice activity only — join voice in Discord.',
  });
}
