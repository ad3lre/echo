/** Canonical Echo guild channel type strings (DB `echo_channels.type`). */

export const ECHO_CHANNEL_TYPES = [
  'text',
  'voice',
  'forum',
  'stage',
  'paper',
] as const;

export type EchoChannelType = (typeof ECHO_CHANNEL_TYPES)[number];

export function isEchoChannelType(t: string): t is EchoChannelType {
  return (ECHO_CHANNEL_TYPES as readonly string[]).includes(t);
}

export function isPaperChannelType(t: string): t is 'paper' {
  return t === 'paper';
}
