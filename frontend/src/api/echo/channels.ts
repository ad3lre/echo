import { echoPartialToChannelOverrides } from '@shared/rolePermissionBridge';
import type { ChannelSummary } from '@shared/types';
import type { ForumCreatorDefaultPerms } from '@shared/types';
import { echoFetch } from './transport';
import type { ChannelCategory } from '@/composables/useChannels';
import type { EchoChannelRow, EchoChannelPatch } from './types';
import { fetchEchoServerCategories } from './categories';

export async function fetchEchoServerChannels(
  token: string,
  serverId: string,
): Promise<{ channels: EchoChannelRow[] }> {
  return echoFetch(token, `/servers/${encodeURIComponent(serverId)}/channels`);
}

export async function postEchoServerChannel(
  token: string,
  serverId: string,
  body: {
    name: string;
    type: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
    categoryId: string;
    iconKey?: string;
  },
): Promise<{ channelId: string }> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    type: body.type,
    categoryId: body.categoryId.trim(),
  };
  if (body.iconKey?.trim()) payload.iconKey = body.iconKey.trim();
  return echoFetch<{ channelId: string }>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteEchoChannel(
  token: string | null | undefined,
  channelId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/channels/${encodeURIComponent(channelId)}`,
    { method: 'DELETE' },
  );
}

export async function patchEchoChannel(
  token: string,
  channelId: string,
  patch: EchoChannelPatch,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.categoryId !== undefined) body.categoryId = patch.categoryId;
  if (patch.siblingIndex !== undefined) body.siblingIndex = patch.siblingIndex;
  if (patch.moveOutOfCategoryPermission !== undefined) {
    body.moveOutOfCategoryPermission = patch.moveOutOfCategoryPermission;
  }
  if (patch.slowmodeSeconds !== undefined)
    body.slowmodeSeconds = patch.slowmodeSeconds;
  if (patch.userLimit !== undefined) body.userLimit = patch.userLimit;
  if (patch.bitrateBps !== undefined) body.bitrateBps = patch.bitrateBps;
  if (patch.voiceE2eeEnabled !== undefined) {
    body.voiceE2eeEnabled = patch.voiceE2eeEnabled;
  }
  if (patch.nsfw !== undefined) body.nsfw = patch.nsfw;
  if (patch.iconKey !== undefined) body.iconKey = patch.iconKey;
  if (patch.messageHistoryAnchor !== undefined)
    body.messageHistoryAnchor = patch.messageHistoryAnchor;
  if (patch.permissionOverrides !== undefined)
    body.permissionOverrides = patch.permissionOverrides;
  if (patch.forumCreatorDefaultPerms !== undefined) {
    body.forumCreatorDefaultPerms = patch.forumCreatorDefaultPerms;
  }
  if (patch.autoDeleteAfterSeconds !== undefined) {
    body.autoDeleteAfterSeconds = patch.autoDeleteAfterSeconds;
  }
  if (patch.autoDeleteSyncedToCategory !== undefined) {
    body.autoDeleteSyncedToCategory = patch.autoDeleteSyncedToCategory;
  }
  if (patch.messageFormatTemplate !== undefined) {
    body.messageFormatTemplate = patch.messageFormatTemplate;
  }
  if (patch.messageFormatHard !== undefined) {
    body.messageFormatHard = patch.messageFormatHard;
  }
  await echoFetch<Record<string, unknown>>(
    token,
    `/channels/${encodeURIComponent(channelId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function echoChannelRowToChannelSummary(
  c: EchoChannelRow,
  _serverId: string,
): ChannelSummary {
  const parentChannelId =
    typeof c.parentChannelId === 'string' && c.parentChannelId.trim()
      ? c.parentChannelId.trim()
      : undefined;
  const forumAvailableTags =
    Array.isArray(c.forumAvailableTags) &&
    c.forumAvailableTags.every(
      (t) =>
        !!t &&
        typeof t === 'object' &&
        'id' in (t as any) &&
        'name' in (t as any) &&
        typeof (t as any).id === 'string' &&
        typeof (t as any).name === 'string',
    )
      ? (c.forumAvailableTags as any)
      : undefined;
  const forumPostTagIds = Array.isArray(c.forumPostTagIds)
    ? c.forumPostTagIds.filter((x): x is string => typeof x === 'string')
    : undefined;
  const channelType =
    c.type === 'voice'
      ? 'voice'
      : c.type === 'stage'
        ? 'stage'
        : c.type === 'forum'
          ? 'forum'
          : 'text';
  const base: ChannelSummary = {
    id: c.id,
    name: c.name,
    type: channelType,
    ...(parentChannelId ? { parentChannelId } : {}),
    slowModeSeconds: c.slowmodeSeconds ?? 0,
    userLimit: c.userLimit ?? 0,
    nsfw: c.nsfw ?? false,
    bitrateBps: c.bitrateBps ?? null,
    ...((channelType === 'voice' || channelType === 'stage') &&
    c.voiceE2eeEnabled === true
      ? { voiceE2eeEnabled: true }
      : {}),
    ...(c.type === 'text' && c.messageHistoryAnchor === 'top'
      ? { messageHistoryAnchor: 'top' as const }
      : {}),
    ...(typeof c.iconKey === 'string' && c.iconKey.trim()
      ? { iconKey: c.iconKey.trim() }
      : {}),
    ...(typeof c.discordChannelId === 'string' && c.discordChannelId.trim()
      ? { discordChannelId: c.discordChannelId.trim() }
      : {}),
    ...(c.type === 'forum' && forumAvailableTags ? { forumAvailableTags } : {}),
    ...(forumPostTagIds ? { forumPostTagIds } : {}),
    ...(c.forumPostPinned === true ? { forumPostPinned: true } : {}),
    ...(c.forumPostLocked === true ? { forumPostLocked: true } : {}),
    ...(typeof c.forumPostArchivedAt === 'string' &&
    c.forumPostArchivedAt.trim()
      ? { forumPostArchivedAt: c.forumPostArchivedAt.trim() }
      : {}),
    ...(c.type === 'forum' &&
    c.forumCreatorDefaultPerms != null &&
    typeof c.forumCreatorDefaultPerms === 'object' &&
    !Array.isArray(c.forumCreatorDefaultPerms)
      ? {
          forumCreatorDefaultPerms:
            c.forumCreatorDefaultPerms as ForumCreatorDefaultPerms,
        }
      : {}),
    ...(typeof c.forumPostCreatorUserId === 'string' &&
    c.forumPostCreatorUserId.trim()
      ? { forumPostCreatorUserId: c.forumPostCreatorUserId.trim() }
      : {}),
    ...(c.type === 'text' || c.type === 'forum'
      ? {
          autoDeleteAfterSeconds: c.autoDeleteAfterSeconds ?? null,
          autoDeleteSyncedToCategory: c.autoDeleteSyncedToCategory !== false,
          categoryAutoDeleteAfterSeconds:
            c.categoryAutoDeleteAfterSeconds ?? null,
          ...(typeof c.messageFormatTemplate === 'string' &&
          c.messageFormatTemplate.trim()
            ? {
                messageFormatTemplate: c.messageFormatTemplate,
                messageFormatHard: c.messageFormatHard === true,
              }
            : {}),
        }
      : {}),
  };
  const ov = c.permissionOverrides;
  if (ov != null && typeof ov === 'object' && !Array.isArray(ov)) {
    return {
      ...base,
      channelPermissions: {
        syncWithCategory: false,
        overrides: echoPartialToChannelOverrides(ov as Record<string, unknown>),
      },
    };
  }
  return base;
}

/**
 * Merge category list with categoryless channels using compact ordering
 * (`category.position` vs root `channel.position`).
 */
export function mergeEchoChannelCategoriesWithRoots(
  categories: import('./types').EchoCategoryDto[],
  channels: EchoChannelRow[],
  serverId: string,
): ChannelCategory[] {
  const roots = channels.filter((ch) => !ch.categoryId?.trim());
  const categorized = channels.filter((ch) => !!ch.categoryId?.trim());
  const groupedList = groupEchoChannelsToCategories(categorized, serverId);
  const groupedMap = new Map(groupedList.map((g) => [g.id, g]));

  type Slot =
    | {
        type: 'cat';
        pos: number;
        tie: string;
        cat: import('./types').EchoCategoryDto;
      }
    | { type: 'root'; pos: number; tie: string; ch: EchoChannelRow };

  const slots: Slot[] = [];
  for (const cat of categories) {
    slots.push({ type: 'cat', pos: cat.position, tie: `c:${cat.id}`, cat });
  }
  for (const ch of roots) {
    slots.push({ type: 'root', pos: ch.position, tie: `r:${ch.id}`, ch });
  }
  slots.sort((a, b) => a.pos - b.pos || a.tie.localeCompare(b.tie));

  const out: ChannelCategory[] = [];
  let i = 0;
  while (i < slots.length) {
    const s = slots[i]!;
    if (s.type === 'cat') {
      const g = groupedMap.get(s.cat.id);
      out.push({
        id: s.cat.id,
        name: s.cat.name,
        channels: g?.channels ?? [],
        channelPermissionDefaults: g?.channelPermissionDefaults ?? {},
        autoDeleteAfterSeconds: s.cat.autoDeleteAfterSeconds ?? null,
      });
      i += 1;
      continue;
    }
    const batch: EchoChannelRow[] = [];
    while (i < slots.length && slots[i]!.type === 'root') {
      batch.push((slots[i] as Extract<Slot, { type: 'root' }>).ch);
      i += 1;
    }
    if (batch.length === 0) continue;
    out.push({
      id: `__uncategorized_${batch[0]!.id}`,
      name: 'Uncategorized',
      hideCategoryHeader: true,
      channels: batch.map((row) =>
        echoChannelRowToChannelSummary(row, serverId),
      ),
      channelPermissionDefaults: {},
    });
  }
  return out;
}

/**
 * Merge `GET .../categories` (order + empty categories) with channel rows.
 * Category list order follows API `position`.
 */
export async function buildEchoChannelCategoriesForServer(
  token: string,
  serverId: string,
): Promise<ChannelCategory[]> {
  const [{ categories }, { channels }] = await Promise.all([
    fetchEchoServerCategories(token, serverId),
    fetchEchoServerChannels(token, serverId),
  ]);
  return mergeEchoChannelCategoriesWithRoots(categories, channels, serverId);
}

/** Group API channel rows into UI categories (API order is category position, then channel position). */
export function groupEchoChannelsToCategories(
  channels: EchoChannelRow[],
  serverId = '',
): ChannelCategory[] {
  const order: string[] = [];
  const map = new Map<string, EchoChannelRow[]>();
  for (const ch of channels) {
    const cid = ch.categoryId?.trim() || '';
    if (!cid) continue;
    if (!map.has(cid)) {
      map.set(cid, []);
      order.push(cid);
    }
    map.get(cid)!.push(ch);
  }
  const result: ChannelCategory[] = [];
  for (const cid of order) {
    const chs = map.get(cid)!;
    chs.sort((a, b) => a.position - b.position);
    const name = chs[0]?.categoryName?.trim() || 'Text Channels';
    result.push({
      id: cid,
      name,
      channels: chs.map((c) => echoChannelRowToChannelSummary(c, serverId)),
      channelPermissionDefaults: {},
    });
  }
  return result;
}
