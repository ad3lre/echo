import { echoT } from '@/i18n';
/** Concise hover labels for voice UI indicators (Discord-style clarity, Echo wording). */

export function voiceMuteDeafenHoverTitle(input: {
  deafened?: boolean;
  muted?: boolean;
  serverDeafened?: boolean;
  serverMuted?: boolean;
}): string | undefined {
  if (input.serverDeafened) return echoT('voiceChrome.serverDeafened');
  if (input.deafened) return echoT('voiceChrome.deafened');
  if (input.serverMuted) return echoT('voiceChrome.serverMuted');
  if (input.muted) return echoT('voiceChrome.muted');
  return undefined;
}

export const VOICE_STREAMING_HOVER_TITLE = 'Sharing screen';
export const VOICE_CAMERA_ON_HOVER_TITLE = 'Camera on';

/** Avatar wrappers use this when {@link QuarterCallMediaBadges} overlays are pointer-events-none. */
export function quarterCallMediaBadgesTitle(input: {
  showDeafened: boolean;
  showMutedOnly: boolean;
}): string | undefined {
  if (input.showDeafened) return echoT('voiceChrome.deafened');
  if (input.showMutedOnly) return echoT('voiceChrome.muted');
  return undefined;
}
