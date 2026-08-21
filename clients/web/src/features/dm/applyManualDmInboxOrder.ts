import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';

export function dmInboxEntrySortKey(e: DmPanelInboxEntry): string {
  return e.kind === 'group' ? `g:${e.id}` : `u:${e.id}`;
}

/**
 * Stable merge: honor a persisted key order, then append any new inbox rows in `entries` order.
 */
export function applyManualDmInboxOrder(
  entries: readonly DmPanelInboxEntry[],
  manualKeys: readonly string[],
): DmPanelInboxEntry[] {
  if (!manualKeys.length) return [...entries];
  const map = new Map(entries.map((e) => [dmInboxEntrySortKey(e), e] as const));
  const out: DmPanelInboxEntry[] = [];
  const used = new Set<string>();
  for (const k of manualKeys) {
    const e = map.get(k);
    if (e) {
      out.push(e);
      used.add(k);
    }
  }
  for (const e of entries) {
    const k = dmInboxEntrySortKey(e);
    if (!used.has(k)) out.push(e);
  }
  return out;
}
