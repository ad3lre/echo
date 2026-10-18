/**
 * Canonical joined-server list ordering — shared by web More Servers / mobile
 * Servers tab. Mirror in `clients/apple/.../EchoServerListOrdering.swift`.
 *
 * Order: starred/pinned rank → MRU rank → base API/rail index (not A–Z).
 */

/** Starred / pinned servers at the top of the list (web rail + More Servers). */
export const MAX_STARRED_SERVERS = 4;

/** Cap for persisted MRU id list. */
export const SERVER_RAIL_MRU_MAX_STORED = 64;

export type JoinedServerListOrderOpts = {
  /** Star / pin ids in pin order (first = top). */
  pinnedIds: readonly string[];
  /** Most-recently-used ids (first = most recent). */
  mruIds: readonly string[];
  /** Index in the API / saved-rail server array. */
  baseIndexById: ReadonlyMap<string, number>;
};

function rankInList(ids: readonly string[], id: string): number {
  const i = ids.indexOf(id);
  return i === -1 ? 99_999 : i;
}

export function compareJoinedServerListOrder(
  aId: string,
  bId: string,
  opts: JoinedServerListOrderOpts,
): number {
  const pr = rankInList(opts.pinnedIds, aId) - rankInList(opts.pinnedIds, bId);
  if (pr !== 0) return pr;
  const mr = rankInList(opts.mruIds, aId) - rankInList(opts.mruIds, bId);
  if (mr !== 0) return mr;
  return (
    (opts.baseIndexById.get(aId) ?? 0) - (opts.baseIndexById.get(bId) ?? 0)
  );
}

export function sortJoinedServerIds(
  serverIds: readonly string[],
  opts: Omit<JoinedServerListOrderOpts, 'baseIndexById'>,
): string[] {
  const baseIndexById = new Map(serverIds.map((id, idx) => [id, idx] as const));
  return [...serverIds].sort((a, b) =>
    compareJoinedServerListOrder(a, b, { ...opts, baseIndexById }),
  );
}

/** Prepend `serverId` to MRU, dedupe, cap length. */
export function touchServerRailMru(
  mruIds: readonly string[],
  serverId: string,
  maxStored = SERVER_RAIL_MRU_MAX_STORED,
): string[] {
  const id = serverId.trim();
  if (!id) return [...mruIds];
  const next = [id, ...mruIds.filter((x) => x !== id)];
  return next.slice(0, Math.max(1, maxStored));
}
