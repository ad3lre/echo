import { isExcludedFromExploreDirectory } from '@/utils/exploreDirectory';

export type ExploreDirectoryRow = {
  id?: string;
  name: string;
  pfp: string;
  banner?: string;
  description?: string;
  tags?: string[];
  memberCount?: number;
  /** Users in voice on this server (directory API). */
  voiceParticipantCount?: number;
  createdAt?: string;
};

export type ExploreQuickFilter = {
  tag: string;
  count: number;
};

export function isPublicExploreDirectoryRow(
  entry: Pick<ExploreDirectoryRow, 'id' | 'name'>,
): boolean {
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) return false;
  return !isExcludedFromExploreDirectory(entry);
}

export function filterPublicExploreDirectoryRows<T extends ExploreDirectoryRow>(
  rows: T[],
): T[] {
  const filtered = rows.filter((row) => isPublicExploreDirectoryRow(row));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of filtered) {
    const id = String(row.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export function normalizeExploreDirectoryTags(
  raw: string[] | undefined,
): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of raw) {
    const normalized = String(tag ?? '')
      .trim()
      .toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Human label for a canonical (lowercase) explore tag — first character uppercased. */
export function exploreTagDisplayLabel(canonicalTag: string): string {
  const t = String(canonicalTag ?? '').trim();
  if (!t) return '';
  const chars = [...t];
  const head = chars[0];
  if (!head) return '';
  return head.toLocaleUpperCase() + chars.slice(1).join('');
}

export function collectExploreQuickFilters(
  rows: ExploreDirectoryRow[],
  limit = 12,
): ExploreQuickFilter[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of normalizeExploreDirectoryTags(row.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([tag, count]) => ({ tag, count }));
}

/** VC-active rows first, then `compare` (stable via optional `order`). */
export function compareExploreServersWithVoicePriority<
  T extends { voiceParticipantCount?: number; order?: number },
>(a: T, b: T, compare: (a: T, b: T) => number): number {
  const aVoice = (a.voiceParticipantCount ?? 0) > 0;
  const bVoice = (b.voiceParticipantCount ?? 0) > 0;
  if (aVoice !== bVoice) return Number(bVoice) - Number(aVoice);
  return compare(a, b) || (a.order ?? 0) - (b.order ?? 0);
}

export function sortExploreServersWithVoicePriority<
  T extends { voiceParticipantCount?: number; order?: number },
>(list: T[], compare: (a: T, b: T) => number): T[] {
  return [...list].sort((a, b) =>
    compareExploreServersWithVoicePriority(a, b, compare),
  );
}

export function filterExploreDirectoryRowsByTags<T extends ExploreDirectoryRow>(
  rows: T[],
  selectedTags: string[],
): T[] {
  const normalizedSelected = normalizeExploreDirectoryTags(selectedTags);
  if (normalizedSelected.length === 0) return rows;
  const wanted = new Set(normalizedSelected);
  return rows.filter((row) =>
    normalizeExploreDirectoryTags(row.tags).some((tag) => wanted.has(tag)),
  );
}
