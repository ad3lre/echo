import { selectPresence } from '@/features/layout/presence';

export const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  quantum: 'Build, ship, and iterate with the core community behind Quantum.',
  empire:
    'Command central for strategy, coordination, and polished community events.',
  mti: 'Fast-paced racing discussions, telemetry breakdowns, and pit lane chatter.',
  kamauo:
    'A welcoming social server with regular events, voice hangouts, and creator spaces.',
  typeclub:
    'Typing races, drills, leaderboards, and a friendly crew improving together.',
};

export function normalizedStatus(
  status?: string,
): 'online' | 'idle' | 'do_not_disturb' | 'offline' | undefined {
  return selectPresence({ rowStatus: status }).status;
}

export function countOnlineUsers(users: Array<{ status?: string }>): number {
  return users.filter((user) => normalizedStatus(user.status) === 'online')
    .length;
}
