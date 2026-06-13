import type { Server } from '@shared/types';

/** Max server icons on the main rail before overflow / “more” (must match Pinia `visibleServers` base slice). */
export const VISIBLE_SERVER_RAIL_SLOT_COUNT = 5;

/** Starred / pinned-from-more servers on the rail (each counts toward {@link VISIBLE_SERVER_RAIL_SLOT_COUNT}). */
export const MAX_STARRED_SERVERS = 4;

/** Cap for persisted MRU id list (localStorage). */
export const SERVER_RAIL_MRU_MAX_STORED = 64;

export type ServerRailProjection = {
  visible: Server[];
  /** Starred guilds (shown first on the rail). */
  starred: Server[];
  /** Recent non-starred fill after starred (MRU + fallback). */
  recentFill: Server[];
  /** First {@link VISIBLE_SERVER_RAIL_SLOT_COUNT} entries of `allServers` (legacy ordering aid). */
  base: Server[];
};

/**
 * At most {@link VISIBLE_SERVER_RAIL_SLOT_COUNT} icons: up to {@link MAX_STARRED_SERVERS} starred first,
 * then most-recent non-starred (from `mruIds`) with `allServers` order as fallback. Never appends a 6th
 * “overflow active” slot — selection outside this list is handled via overflow UI only.
 */
export function projectServerRailVisibleServers(
  allServers: readonly Server[],
  pinned: readonly Server[],
  mruIds: readonly string[],
): ServerRailProjection {
  const base = allServers.slice(0, VISIBLE_SERVER_RAIL_SLOT_COUNT);
  if (allServers.length === 0) {
    return { visible: [], starred: [], recentFill: [], base: [...base] };
  }
  const byId = new Map(allServers.map((s) => [s.id, s] as const));
  const validIds = new Set(allServers.map((s) => s.id));

  const starred: Server[] = [];
  const starredIds = new Set<string>();
  for (const s of pinned) {
    if (starred.length >= MAX_STARRED_SERVERS) break;
    const row = byId.get(s.id);
    if (!row || starredIds.has(s.id)) continue;
    starred.push(row);
    starredIds.add(s.id);
  }

  const need = VISIBLE_SERVER_RAIL_SLOT_COUNT - starred.length;
  const recentFill: Server[] = [];
  if (need > 0) {
    const seen = new Set(starredIds);
    for (const id of mruIds) {
      if (recentFill.length >= need) break;
      if (!validIds.has(id) || seen.has(id)) continue;
      const row = byId.get(id);
      if (!row) continue;
      recentFill.push(row);
      seen.add(id);
    }
    if (recentFill.length < need) {
      for (const s of allServers) {
        if (recentFill.length >= need) break;
        if (seen.has(s.id)) continue;
        recentFill.push(s);
        seen.add(s.id);
      }
    }
  }

  const visible = [...starred, ...recentFill];
  return { visible, starred, recentFill, base: [...base] };
}

/**
 * Visible rail icons in display order: membership from {@link projectServerRailVisibleServers},
 * sequence from `allServers` (client saved rail order). Keeps drag indices aligned with the UI
 * and preserves user reorder across starred / MRU segments.
 */
export function resolveVisibleServerRail(
  allServers: readonly Server[],
  pinned: readonly Server[],
  mruIds: readonly string[],
  opts?: { preferSavedOrder?: boolean },
): Server[] {
  const { visible: membership } = projectServerRailVisibleServers(
    allServers,
    pinned,
    mruIds,
  );
  if (membership.length === 0) return [];
  if (!opts?.preferSavedOrder) {
    return membership;
  }
  const memberIds = new Set(membership.map((s) => s.id));
  const ordered: Server[] = [];
  for (const s of allServers) {
    if (!memberIds.has(s.id)) continue;
    ordered.push(s);
    if (ordered.length >= VISIBLE_SERVER_RAIL_SLOT_COUNT) break;
  }
  if (ordered.length < membership.length) {
    const have = new Set(ordered.map((s) => s.id));
    for (const s of membership) {
      if (!have.has(s.id)) ordered.push(s);
    }
  }
  return ordered.slice(0, VISIBLE_SERVER_RAIL_SLOT_COUNT);
}

/**
 * Map a vertical-rail “gap before index L” (0..n) to `toIndex` for remove-then-insert reorder
 * (same semantics as `reorderVisibleServers`: splice out `fromIndex`, then splice in at `toIndex`).
 * Gap L sits before the item currently at index L (L === n is the gap after the last item).
 */
export function railLineBeforeToToIndex(
  fromIndex: number,
  lineBefore: number,
  n: number,
): number {
  const L = Math.max(0, Math.min(lineBefore, n));
  return fromIndex < L ? L - 1 : L;
}

/** Axis-aligned rectangle from layout measurement (e.g. `getBoundingClientRect`). */
export type RailSlotRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Build ordered boundary coordinates for “line before gap k” (k = 0..n) on one axis.
 * `n` = visible server icon count. When `moreRect` is set, gap `n` sits between the last
 * server slot and the “more” control; otherwise gap `n` is the trailing edge of the last slot.
 */
export function railDropBoundariesFromRects(
  slotRects: readonly RailSlotRect[],
  horizontal: boolean,
  moreRect: RailSlotRect | null,
): number[] {
  const n = slotRects.length;
  if (n === 0) return [0];
  const start = (r: RailSlotRect) => (horizontal ? r.left : r.top);
  const end = (r: RailSlotRect) => (horizontal ? r.right : r.bottom);
  const boundaries: number[] = new Array(n + 1);
  boundaries[0] = start(slotRects[0]!);
  for (let i = 1; i < n; i++) {
    boundaries[i] = (end(slotRects[i - 1]!) + start(slotRects[i]!)) / 2;
  }
  if (moreRect) {
    boundaries[n] = (end(slotRects[n - 1]!) + start(moreRect)) / 2;
  } else {
    boundaries[n] = end(slotRects[n - 1]!);
  }
  return boundaries;
}

/**
 * Map pointer position to gap index 0..n from precomputed boundaries (monotone).
 */
export function railLineBeforeFromBoundaries(
  position: number,
  boundaries: readonly number[],
): number {
  const n = boundaries.length - 1;
  if (n <= 0) return 0;
  for (let k = 0; k < n; k++) {
    const mid = (boundaries[k]! + boundaries[k + 1]!) / 2;
    if (position < mid) return k;
  }
  return n;
}

/**
 * Same as {@link railLineBeforeFromBoundaries} but only moves one gap at a time unless
 * `|raw - prev| > 1`, reducing flicker when the pointer jitters near a threshold.
 */
export function railLineBeforeFromBoundariesSticky(
  position: number,
  boundaries: readonly number[],
  prevLineBefore: number | null,
  deadbandPx: number,
): number {
  const raw = railLineBeforeFromBoundaries(position, boundaries);
  if (prevLineBefore === null) return raw;
  if (raw === prevLineBefore) return prevLineBefore;
  if (Math.abs(raw - prevLineBefore) > 1) return raw;
  const lo = Math.min(prevLineBefore, raw);
  const threshold = (boundaries[lo]! + boundaries[lo + 1]!) / 2;
  if (raw > prevLineBefore) {
    return position >= threshold + deadbandPx ? raw : prevLineBefore;
  }
  return position <= threshold - deadbandPx ? raw : prevLineBefore;
}

/**
 * Reorder the visible server rail (starred prefix + MRU fill, at most {@link VISIBLE_SERVER_RAIL_SLOT_COUNT} icons),
 * returning updated full `servers` list, starred order, and MRU ids.
 */
export function reorderServerRail(input: {
  allServers: readonly Server[];
  pinnedMore: readonly Server[];
  mruIds: readonly string[];
  fromIndex: number;
  toIndex: number;
  preferSavedOrder?: boolean;
}): { servers: Server[]; pinnedMore: Server[]; mruIds: string[] } {
  const {
    allServers,
    pinnedMore,
    mruIds,
    fromIndex,
    toIndex,
    preferSavedOrder,
  } = input;
  const visible = resolveVisibleServerRail(allServers, pinnedMore, mruIds, {
    preferSavedOrder,
  });
  if (visible.length <= 1) {
    return {
      servers: [...allServers],
      pinnedMore: [...pinnedMore],
      mruIds: [...mruIds],
    };
  }

  const from = Math.min(Math.max(0, fromIndex), visible.length - 1);
  const to = Math.min(Math.max(0, toIndex), visible.length - 1);
  if (from === to) {
    return {
      servers: [...allServers],
      pinnedMore: [...pinnedMore],
      mruIds: [...mruIds],
    };
  }

  const visibleIds = visible.map((s) => s.id);
  const [movedId] = visibleIds.splice(from, 1);
  if (!movedId) {
    return {
      servers: [...allServers],
      pinnedMore: [...pinnedMore],
      mruIds: [...mruIds],
    };
  }
  visibleIds.splice(to, 0, movedId);

  return applyServerRailVisibleOrder({
    allServers,
    pinnedMore,
    mruIds,
    newVisibleIds: visibleIds,
  });
}

function applyServerRailVisibleOrder(input: {
  allServers: readonly Server[];
  pinnedMore: readonly Server[];
  mruIds: readonly string[];
  newVisibleIds: readonly string[];
}): { servers: Server[]; pinnedMore: Server[]; mruIds: string[] } {
  const { allServers, pinnedMore, mruIds, newVisibleIds } = input;
  const byId = new Map(allServers.map((s) => [s.id, s] as const));
  const pinnedSet = new Set(pinnedMore.map((s) => s.id));
  const visibleIdSet = new Set(newVisibleIds);

  const visiblePinnedIds = newVisibleIds.filter((id) => pinnedSet.has(id));
  const frontPinned = visiblePinnedIds
    .map((id) => byId.get(id))
    .filter((s): s is Server => !!s);
  const tailPinned = pinnedMore.filter((s) => !visiblePinnedIds.includes(s.id));
  const nextPinned = [...frontPinned, ...tailPinned];

  const nextMru = [
    ...newVisibleIds,
    ...mruIds.filter((id) => !visibleIdSet.has(id)),
  ].slice(0, SERVER_RAIL_MRU_MAX_STORED);

  const nextVisible = newVisibleIds
    .map((id) => byId.get(id))
    .filter((s): s is Server => !!s);
  const remainder = allServers.filter((s) => !visibleIdSet.has(s.id));
  const nextServers = [...nextVisible, ...remainder];

  return {
    servers: nextServers,
    pinnedMore: nextPinned,
    mruIds: nextMru,
  };
}

/**
 * Reorder rail slots when the horizontal action rail shows a transient “recent”
 * overflow icon (selected guild not in the fixed visible slice). Index `n` is the
 * overflow slot where `n = projection.visible.length`.
 */
export function reorderServerRailWithOverflow(input: {
  allServers: readonly Server[];
  pinnedMore: readonly Server[];
  mruIds: readonly string[];
  fromIndex: number;
  toIndex: number;
  overflowServerId: string;
  preferSavedOrder?: boolean;
}): { servers: Server[]; pinnedMore: Server[]; mruIds: string[] } {
  const {
    allServers,
    pinnedMore,
    mruIds,
    fromIndex,
    toIndex,
    overflowServerId,
    preferSavedOrder,
  } = input;
  const visible = resolveVisibleServerRail(allServers, pinnedMore, mruIds, {
    preferSavedOrder,
  });
  const n = visible.length;
  const overflowIndex = n;

  if (n === 0) {
    return {
      servers: [...allServers],
      pinnedMore: [...pinnedMore],
      mruIds: [...mruIds],
    };
  }

  if (fromIndex < n && toIndex < n) {
    return reorderServerRail({
      allServers,
      pinnedMore,
      mruIds,
      fromIndex,
      toIndex,
      preferSavedOrder,
    });
  }

  if (fromIndex === overflowIndex && toIndex < n) {
    const visibleIds = visible.map((s) => s.id);
    const to = Math.min(Math.max(0, toIndex), visibleIds.length);
    const withoutOverflow = visibleIds.filter((id) => id !== overflowServerId);
    const nextIds = [...withoutOverflow];
    nextIds.splice(to, 0, overflowServerId);
    const newVisibleIds = nextIds.slice(0, VISIBLE_SERVER_RAIL_SLOT_COUNT);
    return applyServerRailVisibleOrder({
      allServers,
      pinnedMore,
      mruIds,
      newVisibleIds,
    });
  }

  return {
    servers: [...allServers],
    pinnedMore: [...pinnedMore],
    mruIds: [...mruIds],
  };
}
