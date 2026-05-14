/**
 * Human-readable default for server vanity paths (e.g. chat-echo.com/my-server).
 */

export function slugifyServerName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return s || 'server';
}

export function mergeServerListsForVanity(
  servers: { id: string; name: string }[],
  pinned: { id: string; name: string }[],
): { id: string; name: string }[] {
  const byId = new Map<string, { id: string; name: string }>();
  for (const row of servers) byId.set(row.id, row);
  for (const row of pinned) byId.set(row.id, row);
  return [...byId.values()];
}

/**
 * Base slug from `currentName`; if another server’s name maps to the same slug, use `base-2`, `base-3`, …
 */
export function suggestServerVanityCode(
  currentName: string,
  currentId: string,
  allServers: { id: string; name: string }[],
): string {
  const base = slugifyServerName(currentName);
  const taken = new Set<string>();
  for (const s of allServers) {
    if (s.id === currentId) continue;
    taken.add(slugifyServerName(s.name));
  }
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${currentId.replace(/-/g, '').slice(0, 8)}`;
}
