/** Concise hover labels for voice UI indicators (Discord-style clarity, Echo wording). */

export function voiceMuteDeafenHoverTitle(input: {
  deafened?: boolean;
  muted?: boolean;
  serverDeafened?: boolean;
  serverMuted?: boolean;
}): string | undefined {
  if (input.serverDeafened) return 'Server deafened';
  if (input.deafened) return 'Deafened';
  if (input.serverMuted) return 'Server muted';
  if (input.muted) return 'Muted';
  return undefined;
}

export const VOICE_STREAMING_HOVER_TITLE = 'Sharing screen';
export const VOICE_CAMERA_ON_HOVER_TITLE = 'Camera on';

/** Avatar wrappers use this when {@link QuarterCallMediaBadges} overlays are pointer-events-none. */
export function quarterCallMediaBadgesTitle(input: {
  showDeafened: boolean;
  showMutedOnly: boolean;
}): string | undefined {
  if (input.showDeafened) return 'Deafened';
  if (input.showMutedOnly) return 'Muted';
  return undefined;
}
