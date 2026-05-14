/**
 * Guild + DM-backed `echo_channels.name` length cap (UI inputs + server writes).
 */
export const ECHO_CHANNEL_NAME_MAX_LENGTH = 48;

export function clampEchoChannelName(raw: string): string {
  return raw.trim().slice(0, ECHO_CHANNEL_NAME_MAX_LENGTH);
}
