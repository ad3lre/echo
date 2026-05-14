import { PUBLIC_INVITE_BASE } from '@/config';

/** Canonical public invite URL format: `https://chat-echo.com/{vanityOrToken}`. */
export function echoInviteSharePageUrl(inviteToken: string): string {
  const t = inviteToken.trim();
  if (!t) return '';
  return `${PUBLIC_INVITE_BASE.replace(/\/$/, '')}/${encodeURIComponent(t)}`;
}

/** Append `voice=<channelId>` for voice-channel-specific invite links (preview + SPA deep link). */
export function appendVoiceToEchoInviteShareUrl(
  url: string,
  voiceChannelId: string | null | undefined,
): string {
  const id = voiceChannelId?.trim();
  if (!id) return url.trim();
  const base = url.trim();
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}voice=${encodeURIComponent(id)}`;
}
