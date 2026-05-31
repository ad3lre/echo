import type { ChannelCategory } from '@/composables/useChannels';
import { icons, getChannelIconVisual } from '@/assets/icons';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { isEchoMessageRead } from '@/services/domain/echoMessageReadState';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import { safeImageUrl } from '@/utils/safeImageUrl';
import type { DmMentionNotificationRow } from './collectDmMentionNotifications';

export type NotificationReadPreset = 'all' | 'unread' | 'read';

export type NotificationSourceSelection =
  | { kind: 'all' }
  | { kind: 'dms' }
  | { kind: 'server'; serverId: string }
  | { kind: 'channel'; channelId: string };

export type MentionNotificationPlaceVisual =
  | { kind: 'svg'; url: string }
  | { kind: 'emoji'; emoji: string }
  | { kind: 'avatar'; url: string; alt: string };

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

function findChannelSummary(
  channelId: string,
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>,
): {
  name: string;
  type?: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
  iconKey?: string;
} | null {
  const cid = channelId.trim();
  if (!cid) return null;
  for (const cats of Object.values(categoriesByServer)) {
    for (const cat of cats ?? []) {
      for (const ch of cat.channels ?? []) {
        if (ch.id === cid) {
          return {
            name: ch.name,
            type: ch.type,
            iconKey: ch.iconKey,
          };
        }
      }
    }
  }
  return null;
}

function resolveDmPeerUserId(
  channelId: string,
  echoDmPeerByChannelId?: ReadonlyMap<string, string>,
): string {
  const mapped = echoDmPeerByChannelId?.get(channelId)?.trim() ?? '';
  if (mapped) return mapped;
  if (channelId.startsWith('dm-group-')) return '';
  if (channelId.startsWith('dm-')) return channelId.slice('dm-'.length).trim();
  return '';
}

function buildAllPlacesVisual(): MentionNotificationPlaceVisual {
  return { kind: 'svg', url: icons.globe };
}

function buildDmsVisual(): MentionNotificationPlaceVisual {
  return { kind: 'svg', url: icons.messageFilled };
}

function buildServerVisual(
  serverId: string,
  serverName: string,
  serverImageUrlById: Readonly<Record<string, string | undefined>>,
): MentionNotificationPlaceVisual {
  return {
    kind: 'avatar',
    url: serverGuildIconDisplayUrl(serverImageUrlById[serverId]),
    alt: serverName.trim() || 'Server',
  };
}

function buildChannelVisual(input: {
  channelId: string;
  channelLabel: string;
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  isPersistedEchoDmThread: (id: string) => boolean;
  users: readonly { id: string; name?: string; pfp?: string }[];
  echoDmPeerByChannelId?: ReadonlyMap<string, string>;
}): MentionNotificationPlaceVisual {
  const channelId = input.channelId.trim();
  if (
    isDmNotificationChannel(channelId, input.isPersistedEchoDmThread) ||
    isDmThreadId(channelId)
  ) {
    if (channelId.startsWith('dm-group-')) {
      return { kind: 'svg', url: icons.communityFilled };
    }
    const peerId = resolveDmPeerUserId(channelId, input.echoDmPeerByChannelId);
    if (peerId) {
      const user = input.users.find((row) => row.id === peerId);
      const pfp = user?.pfp?.trim() ?? '';
      if (pfp) {
        return {
          kind: 'avatar',
          url: safeImageUrl(pfp),
          alt:
            user?.name?.trim() || input.channelLabel.trim() || 'Direct message',
        };
      }
    }
    return { kind: 'svg', url: icons.messageFilled };
  }

  const channel = findChannelSummary(channelId, input.categoriesByServer);
  if (channel) {
    const visual = getChannelIconVisual(channel);
    if (visual.kind === 'emoji') {
      return { kind: 'emoji', emoji: visual.emoji };
    }
    return { kind: 'svg', url: visual.url };
  }

  return { kind: 'svg', url: icons.hashtag };
}

/**
 * Builds quick-filter chips: All places, DMs (if any), each guild with mentions,
 * then per-channel chips (capped) for finer narrowing.
 */
export function buildMentionNotificationSourceChips(input: {
  rows: readonly DmMentionNotificationRow[];
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  serverNameById: Readonly<Record<string, string>>;
  serverImageUrlById?: Readonly<Record<string, string | undefined>>;
  users?: readonly { id: string; name?: string; pfp?: string }[];
  echoDmPeerByChannelId?: ReadonlyMap<string, string>;
  isPersistedEchoDmThread: (id: string) => boolean;
  /** Prefer fresh resolution over cached row labels (avoids stale raw ids). */
  resolveChannelLabel?: (channelId: string) => string;
  /** Max “# channel” chips after server chips (default 12). */
  maxChannelChips?: number;
}): MentionNotificationSourceChip[] {
  const {
    rows,
    categoriesByServer,
    serverNameById,
    serverImageUrlById = {},
    users = [],
    echoDmPeerByChannelId,
    isPersistedEchoDmThread,
    resolveChannelLabel,
    maxChannelChips = 12,
  } = input;

  const chips: MentionNotificationSourceChip[] = [
    {
      key: 'all',
      label: 'All',
      selection: { kind: 'all' },
      visual: buildAllPlacesVisual(),
    },
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
      const label =
        resolveChannelLabel?.(cid) ?? (row.channelLabel.trim() || 'Channel');
      channelsOrdered.push({ id: cid, label });
    }
  }

  if (hasDm) {
    chips.push({
      key: 'dms',
      label: 'DMs',
      selection: { kind: 'dms' },
      visual: buildDmsVisual(),
    });
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
      visual: buildChannelVisual({
        channelId: ch.id,
        channelLabel: raw,
        categoriesByServer,
        isPersistedEchoDmThread,
        users,
        echoDmPeerByChannelId,
      }),
    });
    n += 1;
  }

  return chips;
}
