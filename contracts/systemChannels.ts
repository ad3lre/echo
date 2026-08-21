import type { EchoChannelType } from './types/channel';

/** Guild channel types rendered in the sidebar system section (above regular channels). */
export const ECHO_SYSTEM_CHANNEL_TYPES = ['selfRoles'] as const;

export type EchoSystemChannelType = (typeof ECHO_SYSTEM_CHANNEL_TYPES)[number];

export const ECHO_SYSTEM_CHANNELS_BUCKET_ID = '__echo_system_channels__';

export function isEchoSystemChannelType(
  type: string,
): type is EchoSystemChannelType {
  return (ECHO_SYSTEM_CHANNEL_TYPES as readonly string[]).includes(type);
}

/** True when a channel row belongs in the pinned system section (not regular categories). */
export function isEchoSystemChannel(channel: {
  type: EchoChannelType | string;
}): boolean {
  return isEchoSystemChannelType(channel.type);
}
