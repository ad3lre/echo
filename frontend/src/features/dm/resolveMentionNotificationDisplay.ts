import type { ChannelCategory } from '@/composables/useChannels';
import type { ChannelSummary } from '@shared/types';
import { getChannelDisplayName } from '@/assets/icons';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { isEchoGraphId } from '@/utils/echoIds';

function looksLikeEchoGraphIdString(value: string): boolean {
  return isEchoGraphId(value);
}

/** True when a label is just an unresolved id (UUID / snowflake / dm-* shell id). */
export function mentionNotificationLabelLooksUnresolved(
  label: string,
  entityId?: string,
): boolean {
  const l = label.trim();
  if (!l) return true;
  const id = entityId?.trim() ?? '';
  if (id && l === id) return true;
  if (looksLikeEchoGraphIdString(l)) return true;
  if (l.startsWith('dm-') || l.startsWith('dm-group-')) return true;
  return false;
}

function findGuildChannelName(
  channelId: string,
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>,
): string | null {
  const cid = channelId.trim();
  if (!cid) return null;
  for (const cats of Object.values(categoriesByServer)) {
    for (const cat of cats ?? []) {
      for (const ch of cat.channels ?? []) {
        if (ch.id === cid) {
          const raw = ch.name?.trim();
          return raw ? getChannelDisplayName(raw) : null;
        }
      }
    }
  }
  return null;
}

export function resolveMentionNotificationChannelLabel(input: {
  channelId: string;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary } | null;
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  echoDmPeerByChannelId: ReadonlyMap<string, string>;
  echoDmThreadIds: ReadonlySet<string>;
  groupDMs: Readonly<Record<string, { name?: string }>>;
  users: readonly { id: string; name?: string }[];
}): string {
  const cid = input.channelId.trim();
  if (!cid) return 'Channel';

  const guildCtx = input.findChannelContextById(cid)?.channel;
  if (guildCtx?.name?.trim()) {
    return getChannelDisplayName(guildCtx.name.trim());
  }

  const fromTree = findGuildChannelName(cid, input.categoriesByServer);
  if (fromTree) return fromTree;

  if (isDmThreadId(cid) || input.echoDmThreadIds.has(cid)) {
    const group = input.groupDMs[cid];
    if (group?.name?.trim()) return group.name.trim();
    if (cid.startsWith('dm-group-')) return 'Group DM';
    const peerFromShell = cid.startsWith('dm-') ? cid.slice('dm-'.length) : '';
    const partnerId =
      input.echoDmPeerByChannelId.get(cid) ?? peerFromShell ?? '';
    if (partnerId) {
      const user = input.users.find((u) => u.id === partnerId);
      if (user?.name?.trim()) return user.name.trim();
      return 'Direct message';
    }
    return 'Direct message';
  }

  return 'Channel';
}

export function resolveMentionNotificationAuthorName(input: {
  userId: string;
  authorDisplayName?: string | null;
  users: readonly { id: string; name?: string }[];
  selfUserId?: string | null;
  selfDisplayName?: string | null;
}): string {
  const uid = input.userId.trim();
  if (!uid) return 'Someone';

  const fromMessage = input.authorDisplayName?.trim() ?? '';
  if (
    fromMessage &&
    !mentionNotificationLabelLooksUnresolved(fromMessage, uid)
  ) {
    return fromMessage;
  }

  const known = input.users.find((u) => u.id === uid);
  const roster = known?.name?.trim() ?? '';
  if (roster && roster.toLowerCase() !== 'unknown') return roster;

  const selfId = input.selfUserId?.trim() ?? '';
  if (selfId && uid === selfId) {
    const self = input.selfDisplayName?.trim();
    if (self) return self;
  }

  return 'Someone';
}
