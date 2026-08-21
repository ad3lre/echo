import { computed, ref, type Ref } from 'vue';

export type AuditTab =
  | 'All'
  | 'General'
  | 'Join / leave'
  | 'Message changes'
  | 'Mod: user actions'
  | 'Mod: general actions';
export type AuditTabFilter = AuditTab;
export type AuditTimeFilter =
  | 'All'
  | '1h'
  | '6h'
  | '12h'
  | '24h'
  | '3d'
  | '7d'
  | '30d'
  | '90d';

export interface AuditLogEntry {
  id: string;
  /** Stable id for filtering (Echo `actor_id` or mock-prefixed key). */
  actorId: string;
  tab: AuditTab;
  actor: string;
  action: string;
  time: string;
  createdAt: number;
}

export type AuditActorCatalogRow = { id: string; label: string };

export type UseServerSettingsAuditOpts = {
  liveEntries: Ref<AuditLogEntry[]>;
  useLive: Ref<boolean>;
  /** Populated from an unfiltered Echo fetch; keeps actor picklist when a single actor is selected. */
  auditActorCatalog?: Ref<AuditActorCatalogRow[]>;
  /** Shared with `useServerSettingsEchoAuditBans` for server-side actor refetch. */
  actorFilterRef?: Ref<string>;
};

function mockActorId(displayName: string): string {
  const slug =
    displayName
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') || 'user';
  return `mock-audit-${slug}`;
}

export function useServerSettingsAudit(
  serverName: Ref<string>,
  opts?: UseServerSettingsAuditOpts,
) {
  const internalActorFilter = ref('All');
  const auditActorFilter = opts?.actorFilterRef ?? internalActorFilter;

  const auditTabFilter = ref<AuditTabFilter>('All');
  const auditTimeFilter = ref<AuditTimeFilter>('All');

  const AUDIT_TAB_OPTIONS: AuditTabFilter[] = [
    'All',
    'General',
    'Join / leave',
    'Message changes',
    'Mod: user actions',
    'Mod: general actions',
  ];
  const AUDIT_TIME_OPTIONS: AuditTimeFilter[] = [
    'All',
    '1h',
    '6h',
    '12h',
    '24h',
    '3d',
    '7d',
    '30d',
    '90d',
  ];

  const mockAuditEntries = computed<AuditLogEntry[]>(() => {
    const now = Date.now();
    const h = 60 * 60 * 1000;
    const d = 24 * h;
    const rows: Array<Omit<AuditLogEntry, 'actorId'> & { actor: string }> = [
      {
        id: 'ae-1',
        tab: 'Mod: general actions',
        actor: 'Adel',
        action: `updated ${serverName.value} description`,
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
      {
        id: 'ae-7',
        tab: 'Join / leave',
        actor: 'Cleo',
        action: 'joined the server',
        time: '18 days ago',
        createdAt: now - 18 * d,
      },
    ];
    return rows.map((r) => ({ ...r, actorId: mockActorId(r.actor) }));
  });

  const auditEntries = computed<AuditLogEntry[]>(() =>
    opts?.useLive.value ? opts.liveEntries.value : mockAuditEntries.value,
  );

  const auditActorSelectOptions = computed(() => {
    const allRow = { label: 'All actors', value: 'All' };
    if (opts?.useLive.value && opts.auditActorCatalog?.value?.length) {
      return [
        allRow,
        ...opts.auditActorCatalog.value.map((a) => ({
          label: a.label,
          value: a.id,
        })),
      ];
    }
    const m = new Map<string, string>();
    for (const e of auditEntries.value) {
      if (!m.has(e.actorId)) m.set(e.actorId, e.actor);
    }
    const sorted = [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return [allRow, ...sorted.map(([id, label]) => ({ label, value: id }))];
  });

  function splitAuditActionParts(action: string) {
    const out: Array<
      { type: 'text'; value: string } | { type: 'mention'; value: string }
    > = [];
    const regex = /@([A-Za-z0-9_]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(action))) {
      if (match.index > lastIndex) {
        out.push({ type: 'text', value: action.slice(lastIndex, match.index) });
      }
      out.push({ type: 'mention', value: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < action.length)
      out.push({ type: 'text', value: action.slice(lastIndex) });
    return out;
  }

  const filteredAuditEntries = computed(() => {
    const tab = auditTabFilter.value;
    const actor = auditActorFilter.value;
    const time = auditTimeFilter.value;
    const now = Date.now();
    const h = 60 * 60 * 1000;
    const d = 24 * h;

    let minTs = -Infinity;
    if (time === '1h') minTs = now - h;
    else if (time === '6h') minTs = now - 6 * h;
    else if (time === '12h') minTs = now - 12 * h;
    else if (time === '24h') minTs = now - d;
    else if (time === '3d') minTs = now - 3 * d;
    else if (time === '7d') minTs = now - 7 * d;
    else if (time === '30d') minTs = now - 30 * d;
    else if (time === '90d') minTs = now - 90 * d;

    return auditEntries.value.filter((e) => {
      if (tab !== 'All' && e.tab !== tab) return false;
      if (actor !== 'All' && e.actorId !== actor) return false;
      if (e.createdAt < minTs) return false;
      return true;
    });
  });

  function clearAuditLogFilters() {
    auditActorFilter.value = 'All';
    auditTabFilter.value = 'All';
    auditTimeFilter.value = 'All';
  }

  return {
    auditActorFilter,
    auditTabFilter,
    auditTimeFilter,
    AUDIT_TAB_OPTIONS,
    AUDIT_TIME_OPTIONS,
    auditActorSelectOptions,
    auditEntries,
    filteredAuditEntries,
    splitAuditActionParts,
    clearAuditLogFilters,
  };
}
