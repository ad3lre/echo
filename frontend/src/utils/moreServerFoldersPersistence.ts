const STORAGE_KEY = 'echo-more-servers-widget-folders-v1';

export type MoreServerWidgetFolder = {
  id: string;
  name: string;
  serverIds: string[];
};

export type MoreServerFoldersFile = {
  folders: MoreServerWidgetFolder[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function normalizeMoreServerFolders(
  raw: unknown,
  validServerIds: ReadonlySet<string>,
): MoreServerWidgetFolder[] {
  if (!isRecord(raw)) return [];
  const folders = raw.folders;
  if (!Array.isArray(folders)) return [];
  const out: MoreServerWidgetFolder[] = [];
  for (const entry of folders) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name =
      typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim().slice(0, 48)
        : 'Folder';
    const idsRaw = entry.serverIds;
    if (!Array.isArray(idsRaw)) continue;
    const serverIds: string[] = [];
    const seen = new Set<string>();
    for (const x of idsRaw) {
      if (typeof x !== 'string') continue;
      const sid = x.trim();
      if (!sid || !validServerIds.has(sid) || seen.has(sid)) continue;
      seen.add(sid);
      serverIds.push(sid);
    }
    if (!id) continue;
    out.push({ id, name, serverIds });
  }
  return out;
}

export function readMoreServerFoldersFile(
  validServerIds: ReadonlySet<string>,
): MoreServerFoldersFile {
  if (typeof localStorage === 'undefined') {
    return { folders: [] };
  }
  try {
    const raw = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as unknown;
    return { folders: normalizeMoreServerFolders(raw, validServerIds) };
  } catch {
    return { folders: [] };
  }
}

export function writeMoreServerFoldersFile(file: MoreServerFoldersFile): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* quota / private mode */
  }
}
