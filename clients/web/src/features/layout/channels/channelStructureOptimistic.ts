import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { ChannelSummary } from '@shared/types';
import {
  getParentChannelIdOrNull,
  isForumPostChannel,
} from '@/features/forums/forumPostChannel';

function isTopLevelChannel(ch: ChannelSummary): boolean {
  if (getParentChannelIdOrNull(ch)) return false;
  if (isForumPostChannel(ch)) return false;
  return true;
}

function topLevelChannelIds(channels: ChannelSummary[]): string[] {
  return channels.filter(isTopLevelChannel).map((c) => c.id);
}

function reorderNamedIds(
  orderedIds: string[],
  movedId: string,
  siblingIndex: number,
): string[] | null {
  if (!orderedIds.includes(movedId)) return null;
  const without = orderedIds.filter((id) => id !== movedId);
  const clamped = Math.min(siblingIndex, without.length);
  const next = [
    ...without.slice(0, clamped),
    movedId,
    ...without.slice(clamped),
  ];
  if (next.join('\0') === orderedIds.join('\0')) return null;
  return next;
}

function collectChannelBlock(
  channels: ChannelSummary[],
  rootId: string,
): { block: ChannelSummary[]; rest: ChannelSummary[] } | null {
  if (!channels.some((c) => c.id === rootId)) return null;
  const blockIds = new Set<string>([rootId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const ch of channels) {
      const parent = getParentChannelIdOrNull(ch);
      if (parent && blockIds.has(parent) && !blockIds.has(ch.id)) {
        blockIds.add(ch.id);
        expanded = true;
      }
    }
  }
  return {
    block: channels.filter((c) => blockIds.has(c.id)),
    rest: channels.filter((c) => !blockIds.has(c.id)),
  };
}

function insertBlockAtSiblingIndex(
  channels: ChannelSummary[],
  block: ChannelSummary[],
  siblingIndex: number,
): ChannelSummary[] {
  const topLevel = channels.filter(isTopLevelChannel);
  const trailing = channels.filter((c) => !isTopLevelChannel(c));
  const root = block.find(isTopLevelChannel);
  if (!root) return channels;
  const clamped = Math.min(Math.max(0, siblingIndex), topLevel.length);
  const nextTop = [
    ...topLevel.slice(0, clamped),
    root,
    ...topLevel.slice(clamped),
  ];
  const blockChildren = block.filter((c) => !isTopLevelChannel(c));
  const trailingWithoutBlock = trailing.filter(
    (c) => !block.some((b) => b.id === c.id),
  );
  return [...nextTop, ...blockChildren, ...trailingWithoutBlock];
}

function mergedUncategorizedTopLevelIds(
  categories: ChannelCategory[],
): string[] {
  const ids: string[] = [];
  for (const cat of categories) {
    if (cat.hideCategoryHeader) {
      ids.push(...topLevelChannelIds(cat.channels));
    }
  }
  return ids;
}

function findHideCategoryIndexForInsert(
  categories: ChannelCategory[],
  insertBeforeId: string | null,
): number {
  if (insertBeforeId) {
    for (let i = 0; i < categories.length; i += 1) {
      const cat = categories[i]!;
      if (
        cat.hideCategoryHeader &&
        cat.channels.some((c) => c.id === insertBeforeId)
      ) {
        return i;
      }
    }
  }
  for (let i = categories.length - 1; i >= 0; i -= 1) {
    if (categories[i]!.hideCategoryHeader) return i;
  }
  return -1;
}

function resolveInsertBeforeId(
  orderedIds: string[],
  movedId: string,
  siblingIndex: number,
): string | null {
  const without = orderedIds.filter((id) => id !== movedId);
  const clamped = Math.min(Math.max(0, siblingIndex), without.length);
  return without[clamped] ?? null;
}

/**
 * Optimistically reorder named categories (server settings + channel panel).
 * Uncategorized (`hideCategoryHeader`) slots stay in place.
 */
export function applyOptimisticCategoryReorder(
  categories: ChannelCategory[],
  categoryId: string,
  siblingIndex: number,
): ChannelCategory[] | null {
  const namedIds = categories
    .filter((c) => !c.hideCategoryHeader)
    .map((c) => c.id);
  const nextNamedIds = reorderNamedIds(namedIds, categoryId, siblingIndex);
  if (!nextNamedIds) return null;

  const byId = new Map(
    categories.filter((c) => !c.hideCategoryHeader).map((c) => [c.id, c]),
  );
  let namedIdx = 0;
  return categories.map((cat) => {
    if (cat.hideCategoryHeader) return cat;
    const next = byId.get(nextNamedIds[namedIdx]!);
    namedIdx += 1;
    return next ?? cat;
  });
}

/**
 * Optimistically move/reorder a channel within or across category buckets.
 * `targetCategoryId` null means uncategorized roots (`hideCategoryHeader` buckets).
 */
export function applyOptimisticChannelReorder(
  categories: ChannelCategory[],
  channelId: string,
  targetCategoryId: string | null,
  siblingIndex: number,
): ChannelCategory[] | null {
  let sourceIndex = -1;
  for (let i = 0; i < categories.length; i += 1) {
    if (categories[i]!.channels.some((c) => c.id === channelId)) {
      sourceIndex = i;
      break;
    }
  }
  if (sourceIndex === -1) return null;

  const sourceCat = categories[sourceIndex]!;
  const extracted = collectChannelBlock(sourceCat.channels, channelId);
  if (!extracted) return null;

  const sourceApiId = sourceCat.hideCategoryHeader ? null : sourceCat.id;
  const sameBucket =
    sourceApiId === targetCategoryId ||
    (sourceApiId === null && targetCategoryId === null);

  if (sameBucket) {
    const nextChannels = insertBlockAtSiblingIndex(
      extracted.rest,
      extracted.block,
      siblingIndex,
    );
    if (nextChannels === sourceCat.channels) return null;
    return categories.map((cat, i) =>
      i === sourceIndex ? { ...cat, channels: nextChannels } : cat,
    );
  }

  const next = categories.map((cat, i) =>
    i === sourceIndex ? { ...cat, channels: extracted.rest } : cat,
  );

  if (targetCategoryId !== null) {
    const targetIndex = next.findIndex(
      (c) => !c.hideCategoryHeader && c.id === targetCategoryId,
    );
    if (targetIndex === -1) return null;
    const targetCat = next[targetIndex]!;
    const targetChannels = insertBlockAtSiblingIndex(
      targetCat.channels,
      extracted.block,
      siblingIndex,
    );
    return next.map((cat, i) =>
      i === targetIndex ? { ...cat, channels: targetChannels } : cat,
    );
  }

  const mergedIds = mergedUncategorizedTopLevelIds(next);
  const insertBeforeId = resolveInsertBeforeId(
    mergedIds,
    channelId,
    siblingIndex,
  );
  const hideIndex = findHideCategoryIndexForInsert(next, insertBeforeId);
  if (hideIndex === -1) {
    const root = extracted.block.find(isTopLevelChannel);
    if (!root) return null;
    return [
      ...next,
      {
        id: `__uncategorized_${root.id}`,
        name: 'Uncategorized',
        hideCategoryHeader: true,
        channels: extracted.block,
        channelPermissionDefaults: {},
      },
    ];
  }

  const hideCat = next[hideIndex]!;
  const localSiblingIndex = insertBeforeId
    ? topLevelChannelIds(hideCat.channels).indexOf(insertBeforeId)
    : topLevelChannelIds(hideCat.channels).length;
  const hideChannels = insertBlockAtSiblingIndex(
    hideCat.channels,
    extracted.block,
    localSiblingIndex === -1
      ? topLevelChannelIds(hideCat.channels).length
      : localSiblingIndex,
  );
  return next.map((cat, i) =>
    i === hideIndex ? { ...cat, channels: hideChannels } : cat,
  );
}
