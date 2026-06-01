import type { ChannelCategory } from '@/composables/useChannels';
import { iconEchoRounded } from '@/assets/branding';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { isEchoMessageRead } from '@/services/domain/echoMessageReadState';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import type { DmMentionNotificationRow } from './collectDmMentionNotifications';

export type NotificationReadPreset = 'all' | 'unread' | 'read';

export type NotificationSourceSelection =
  | { kind: 'all' }
  | { kind: 'dms' }
  | { kind: 'server'; serverId: string }
  | { kind: 'channel'; channelId: string };

export type MentionNotificationPlaceVisual =
  | { kind: 'none' }
  | { kind: 'image'; url: string; alt: string };

export type MentionNotificationSourceChip = {
  key: string;
  label: string;
  selection: NotificationSourceSelection;
  visual: MentionNotificationPlaceVisual;
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

function buildAllPlacesVisual(): MentionNotificationPlaceVisual {
  return { kind: 'none' };
}

function buildServerVisual(
  serverId: string,
  serverName: string,
  serverImageUrlById: Readonly<Record<string, string | undefined>>,
): MentionNotificationPlaceVisual {
  const url = serverGuildIconDisplayUrl(serverImageUrlById[serverId]);
  if (url === iconEchoRounded) {
    return { kind: 'none' };
  }
  return {
    kind: 'image',
    url,
    alt: serverName.trim() || 'Server',
  };
}

/**
 * Builds quick-filter chips: All places, then one chip per guild with mentions.
 */
export function buildMentionNotificationSourceChips(input: {
  rows: readonly DmMentionNotificationRow[];
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  serverNameById: Readonly<Record<string, string>>;
  serverImageUrlById?: Readonly<Record<string, string | undefined>>;
}): MentionNotificationSourceChip[] {
  const {
    rows,
    categoriesByServer,
    serverNameById,
    serverImageUrlById = {},
  } = input;

  const chips: MentionNotificationSourceChip[] = [
    {
      key: 'all',
      label: 'All',
      selection: { kind: 'all' },
      visual: buildAllPlacesVisual(),
    },
  ];

  const serverIds = new Set<string>();

  for (const row of rows) {
    const sid = resolveEchoServerIdContainingChannel(
      row.channelId,
      categoriesByServer,
    );
    if (sid) serverIds.add(sid);
  }

  const sortedServers = [...serverIds].sort((a, b) => {
    const na = serverNameById[a]?.trim() || a;
    const nb = serverNameById[b]?.trim() || b;
    return na.localeCompare(nb);
  });

  for (const sid of sortedServers) {
    const serverName = serverNameById[sid]?.trim() || 'Server';
    chips.push({
      key: `server:${sid}`,
      label: truncateChipLabel(serverName),
      selection: { kind: 'server', serverId: sid },
      visual: buildServerVisual(sid, serverName, serverImageUrlById),
    });
  }

  return chips;
}
