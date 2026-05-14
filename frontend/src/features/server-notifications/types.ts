import type { EchoServerNotificationLevel } from '@shared/types';

/** Per-server notification override (user preference, client-side mock). */
export type ServerNotificationLevel = EchoServerNotificationLevel;

export const SERVER_NOTIFICATION_OPTIONS: {
  value: ServerNotificationLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 'all',
    label: 'All messages',
    description: 'Get notified when anyone sends a message in this server.',
  },
  {
    value: 'mentions',
    label: 'Mentions and direct mentions',
    description:
      'Notify for @you, replies, and broadcast pings such as @everyone, @here, @channel, or role-style mentions.',
  },
  {
    value: 'mentions_direct',
    label: 'Direct mentions only',
    description:
      'Only when you are personally @mentioned, not via @everyone, @here, @channel, or roles.',
  },
  {
    value: 'none',
    label: 'Nothing',
    description:
      'No push or desktop alerts from this server (still shows in the app).',
  },
];

export function getServerNotificationSummary(
  level: ServerNotificationLevel,
): string {
  switch (level) {
    case 'all':
      return 'All messages';
    case 'mentions':
      return 'Mentions and direct mentions';
    case 'mentions_direct':
      return 'Direct mentions only';
    case 'none':
      return 'Nothing';
    default:
      return 'Mentions and direct mentions';
  }
}
