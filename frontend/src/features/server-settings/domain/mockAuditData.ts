import type { AuditLogEntry } from '@/features/server-settings/composables/useServerSettingsAudit';

export function mockActorId(displayName: string): string {
  const slug =
    displayName
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') || 'user';
  return `mock-audit-${slug}`;
}

export function buildMockAuditEntries(serverName: string): AuditLogEntry[] {
  const now = Date.now();
  const h = 60 * 60 * 1000;
  const d = 24 * h;
  const rows: Array<Omit<AuditLogEntry, 'actorId'> & { actor: string }> = [
    {
      id: 'ae-1',
      tab: 'Mod: general actions',
      actor: 'Adel',
      action: `updated ${serverName} description`,
      time: '2 minutes ago',
      createdAt: now - 2 * 60 * 1000,
    },
    {
      id: 'ae-2',
      tab: 'Mod: general actions',
      actor: 'Beemo',
      action: 'created an invite link for @Cleo',
      time: '34 minutes ago',
      createdAt: now - 34 * 60 * 1000,
    },
    {
      id: 'ae-3',
      tab: 'Mod: general actions',
      actor: 'Cleo',
      action: 'changed verification level linked with @Dante',
      time: '2 hours ago',
      createdAt: now - 2 * h,
    },
    {
      id: 'ae-4',
      tab: 'Mod: user actions',
      actor: 'Dante',
      action: 'edited role permissions for @Beemo',
      time: 'Yesterday at 8:12 PM',
      createdAt: now - 26 * h,
    },
    {
      id: 'ae-5',
      tab: 'Message changes',
      actor: 'Julia',
      action: 'deleted a message by @Eun in #general',
      time: '3 days ago',
      createdAt: now - 3 * d,
    },
    {
      id: 'ae-6',
      tab: 'Mod: general actions',
      actor: 'Adel',
      action: 'deleted channel #old-lounge',
      time: '12 days ago',
      createdAt: now - 12 * d,
    },
  ];
  return rows.map((r) => ({ ...r, actorId: mockActorId(r.actor) }));
}
