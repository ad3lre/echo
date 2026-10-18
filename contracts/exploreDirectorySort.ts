/**
 * Canonical Explore directory sort — shared by web and mirrored on Apple.
 * Keep in sync with `clients/apple/.../EchoExploreDirectory.swift`.
 */

export type ExploreRecommendedSortRow = {
  order?: number;
  lastVoiceActivityAt?: string;
  lastChatActivityAt?: string;
  hasRealBanner?: boolean;
  hasDescription?: boolean;
};

export type ExploreVoicePriorityRow = {
  voiceParticipantCount?: number;
  order?: number;
};

export type ExploreTrendySortRow = ExploreVoicePriorityRow & {
  memberCount?: number;
  createdAtMs?: number | null;
  order?: number;
};

export function exploreActivityAtMs(iso?: string): number {
  if (!iso?.trim()) return 0;
  const t = Date.parse(iso.trim());
  return Number.isFinite(t) ? t : 0;
}

/** Tertiary Recommended tie-break: banner + description completeness. */
export function exploreDirectoryProfileCompletenessScore(
  row: Pick<ExploreRecommendedSortRow, 'hasRealBanner' | 'hasDescription'>,
): number {
  let score = 0;
  if (row.hasRealBanner) score += 1;
  if (row.hasDescription) score += 1;
  return score;
}

/**
 * Recommended Explore ordering: latest voice activity, then latest chat activity,
 * then fuller public profiles (banner + description), then API order.
 */
export function compareExploreRecommendedServers<
  T extends ExploreRecommendedSortRow,
>(a: T, b: T): number {
  const voiceDiff =
    exploreActivityAtMs(b.lastVoiceActivityAt) -
    exploreActivityAtMs(a.lastVoiceActivityAt);
  if (voiceDiff !== 0) return voiceDiff;

  const chatDiff =
    exploreActivityAtMs(b.lastChatActivityAt) -
    exploreActivityAtMs(a.lastChatActivityAt);
  if (chatDiff !== 0) return chatDiff;

  const profileDiff =
    exploreDirectoryProfileCompletenessScore(b) -
    exploreDirectoryProfileCompletenessScore(a);
  if (profileDiff !== 0) return profileDiff;

  return (a.order ?? 0) - (b.order ?? 0);
}

export function sortExploreRecommendedServers<
  T extends ExploreRecommendedSortRow,
>(list: T[]): T[] {
  return [...list].sort(compareExploreRecommendedServers);
}

/** VC-active rows first, then `compare` (stable via optional `order`). */
export function compareExploreServersWithVoicePriority<
  T extends ExploreVoicePriorityRow,
>(a: T, b: T, compare: (a: T, b: T) => number): number {
  const aVoice = (a.voiceParticipantCount ?? 0) > 0;
  const bVoice = (b.voiceParticipantCount ?? 0) > 0;
  if (aVoice !== bVoice) return Number(bVoice) - Number(aVoice);
  return compare(a, b) || (a.order ?? 0) - (b.order ?? 0);
}

export function sortExploreServersWithVoicePriority<
  T extends ExploreVoicePriorityRow,
>(list: T[], compare: (a: T, b: T) => number): T[] {
  return [...list].sort((a, b) =>
    compareExploreServersWithVoicePriority(a, b, compare),
  );
}

/** `memberCount / sqrt(ageDays)` — used by Trendy mode. */
export function exploreTrendyScore(
  row: Pick<ExploreTrendySortRow, 'memberCount' | 'createdAtMs' | 'order'>,
  opts: { nowMs: number; listLen: number },
): number {
  const listLen = Math.max(1, opts.listLen);
  let ageDays: number;
  const created = row.createdAtMs;
  if (typeof created === 'number' && Number.isFinite(created)) {
    ageDays = Math.max(0.5, (opts.nowMs - created) / 86_400_000);
  } else {
    ageDays = Math.max(0.5, listLen - (row.order ?? 0));
  }
  return (row.memberCount ?? 0) / Math.sqrt(ageDays);
}
