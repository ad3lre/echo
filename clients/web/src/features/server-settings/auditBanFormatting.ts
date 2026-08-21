import type { AuditLogEntry } from '@/features/server-settings/composables/useServerSettingsAudit';
import { formatTimestamp } from '@/features/chat/formatTimestamp';

export type BanListRowUi = {
  id: string;
  userName: string;
  userPfp: string;
  reason: string;
  moderator: string;
  expiresAt: string | null;
  createdAtLabel: string;
};

/** Relative label for a future ban expiry (e.g. "in 2d"). */
export function formatBanExpiresLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((t - Date.now()) / 1000));
  if (sec < 45) return 'soon';
  const min = Math.floor(sec / 60);
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `in ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `in ${d}d`;
  return formatTimestamp(iso);
}

export function formatShortRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return formatTimestamp(iso);
}

export function echoAuditActionToCategory(
  action: string,
): AuditLogEntry['tab'] {
  const a = (action || '').trim();
  if (a === 'member.join' || a === 'member.leave') return 'Join / leave';
  if (a === 'message.edit' || a === 'message.delete') return 'Message changes';
  if (a.startsWith('moderation.')) return 'Mod: user actions';
  if (a.startsWith('member.role') || a === 'member.nickname')
    return 'Mod: user actions';
  if (
    a.startsWith('server.') ||
    a.startsWith('channel.') ||
    a.startsWith('category.') ||
    a.startsWith('role.') ||
    a.startsWith('invite.') ||
    a.startsWith('permission.')
  )
    return 'Mod: general actions';
  return 'General';
}

export function describeEchoAuditAction(
  action: string,
  targetType: string,
  targetId: string,
): string {
  const pretty = (action || '').replace(/\./g, ' ').trim() || 'action';
  if (!targetId) return pretty;
  return `${pretty} · ${targetType || 'target'}: ${targetId}`;
}

export function buildDefaultMockBans(users: { pfp: string }[]): BanListRowUi[] {
  return [
    {
      id: 'ban-1',
      userName: 'RaidAlt_902',
      userPfp: users[0]?.pfp ?? '',
      reason: 'Coordinated spam raid with repeated invite phishing.',
      moderator: 'Cleo',
      expiresAt: null,
      createdAtLabel: '2 days ago',
    },
    {
      id: 'ban-2',
      userName: 'ShoutBotX',
      userPfp: users[1]?.pfp ?? '',
      reason: 'Automated mention spam in 4 channels.',
      moderator: 'Dante',
      expiresAt: 'in 5 days',
      createdAtLabel: '8 hours ago',
    },
    {
      id: 'ban-3',
      userName: 'GhostPing77',
      userPfp: users[2]?.pfp ?? '',
      reason: 'Targeted harassment and repeated evasion.',
      moderator: 'Beemo',
      expiresAt: null,
      createdAtLabel: 'Yesterday',
    },
  ];
}
