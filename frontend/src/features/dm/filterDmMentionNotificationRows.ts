import type { ChannelCategory } from '@/composables/useChannels';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { isEchoMessageRead } from '@/services/domain/echoMessageReadState';
import type { DmMentionNotificationRow } from './collectDmMentionNotifications';

export type NotificationReadPreset = 'all' | 'unread' | 'read';

export type NotificationSourceSelection =
  | { kind: 'all' }
  | { kind: 'dms' }
  | { kind: 'server'; serverId: string }
  | { kind: 'channel'; channelId: string };

export type MentionNotificationSourceChip = {
  key: string;
  label: string;
  selection: NotificationSourceSelection;
};

export function mentionNotificationRowIsRead(
  row: DmMentionNotificationRow,
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>,
): boolean {
  const lr = readStateByChannelId[row.channelId];
  return isEchoMessageRead(lr ?? null, row.messageId);
}

export function isDmNotificationChannel(
  channelId: string,
  isPersistedEchoDmThread: (id: string) => boolean,
): boolean {
  return isDmThreadId(channelId) || isPersistedEchoDmThread(channelId);
}

export function rowMatchesNotificationSource(
  row: DmMentionNotificationRow,
  source: NotificationSourceSelection,
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>,
  isPersistedEchoDmThread: (id: string) => boolean,
): boolean {
  switch (source.kind) {
    case 'all':
      return true;
    case 'dms':
      return isDmNotificationChannel(row.channelId, isPersistedEchoDmThread);
    case 'channel':
      return row.channelId === source.channelId;
    case 'server': {
      const sid = resolveEchoServerIdContainingChannel(
        row.channelId,
        categoriesByServer,
      );
      return sid === source.serverId;
    }
    default:
      return true;
  }
}

export function filterDmMentionNotificationRows(input: {
  rows: readonly DmMentionNotificationRow[];
  preset: NotificationReadPreset;
  source: NotificationSourceSelection;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  isPersistedEchoDmThread: (id: string) => boolean;
}): DmMentionNotificationRow[] {
  const {
    rows,
    preset,
    source,
    readStateByChannelId,
    categoriesByServer,
    isPersistedEchoDmThread,
  } = input;
  return rows.filter((row) => {
    if (
      !rowMatchesNotificationSource(
        row,
        source,
        categoriesByServer,
        isPersistedEchoDmThread,
      )
    ) {
      return false;
    }
    if (preset === 'all') return true;
    const read = mentionNotificationRowIsRead(row, readStateByChannelId);
    if (preset === 'unread') return !read;
    return read;
  });
}

function truncateChipLabel(label: string, max = 22): string {
  const t = label.trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Builds quick-filter chips: All places, DMs (if any), each guild with mentions,
 * then per-channel chips (capped) for finer narrowing.
 */
export function buildMentionNotificationSourceChips(input: {
  rows: readonly DmMentionNotificationRow[];
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  serverNameById: Readonly<Record<string, string>>;
  isPersistedEchoDmThread: (id: string) => boolean;
  /** Max “# channel” chips after server chips (default 12). */
  maxChannelChips?: number;
}): MentionNotificationSourceChip[] {
  const {
    rows,
    categoriesByServer,
    serverNameById,
    isPersistedEchoDmThread,
    maxChannelChips = 12,
  } = input;

  const chips: MentionNotificationSourceChip[] = [
    { key: 'all', label: 'All', selection: { kind: 'all' } },
  ];

  let hasDm = false;
  const serverIds = new Set<string>();
  const channelsOrdered: { id: string; label: string }[] = [];
  const seenCh = new Set<string>();

  for (const row of rows) {
    if (isDmNotificationChannel(row.channelId, isPersistedEchoDmThread)) {
      hasDm = true;
    } else {
      const sid = resolveEchoServerIdContainingChannel(
        row.channelId,
        categoriesByServer,
      );
      if (sid) serverIds.add(sid);
    }
    const cid = row.channelId;
    if (!seenCh.has(cid)) {
      seenCh.add(cid);
      channelsOrdered.push({ id: cid, label: row.channelLabel });
    }
  }

  if (hasDm) {
    chips.push({
      key: 'dms',
      label: 'DMs',
      selection: { kind: 'dms' },
    });
  }

  const sortedServers = [...serverIds].sort((a, b) => {
    const na = serverNameById[a]?.trim() || a;
    const nb = serverNameById[b]?.trim() || b;
    return na.localeCompare(nb);
  });

  for (const sid of sortedServers) {
    chips.push({
      key: `server:${sid}`,
      label: truncateChipLabel(serverNameById[sid]?.trim() || 'Server'),
      selection: { kind: 'server', serverId: sid },
    });
  }

  let n = 0;
  for (const ch of channelsOrdered) {
    if (n >= maxChannelChips) break;
    const raw = ch.label.trim() || ch.id;
    const hashPrefix = isDmNotificationChannel(ch.id, isPersistedEchoDmThread)
      ? ''
      : '# ';
    chips.push({
      key: `channel:${ch.id}`,
      label: truncateChipLabel(`${hashPrefix}${raw}`),
      selection: { kind: 'channel', channelId: ch.id },
    });
    n += 1;
  }

  return chips;
}
