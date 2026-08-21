const STORAGE_KEY = 'echo-server-rail-order-v1';

export function readSavedServerRailOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeSavedServerRailOrder(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Apply last-known client rail order; unknown ids keep API / mock order after known ids. */
export function applySavedServerRailOrder<T extends { id: string }>(
  list: T[],
): T[] {
  const order = readSavedServerRailOrder();
  if (order.length === 0 || list.length === 0) return list;
  const map = new Map(list.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of order) {
    const row = map.get(id);
    if (row) {
      out.push(row);
      seen.add(id);
    }
  }
  for (const s of list) {
    if (!seen.has(s.id)) out.push(s);
  }
  return out;
}

export function pruneSavedServerRailOrder(keepIds: Set<string>): void {
  const cur = readSavedServerRailOrder();
  if (cur.length === 0) return;
  const next = cur.filter((id) => keepIds.has(id));
  writeSavedServerRailOrder(next);
}
