const STORAGE_KEY_V2 = 'echo-more-servers-widget-folders-v2';
const STORAGE_KEY_V1 = 'echo-more-servers-widget-folders-v1';

export type MoreServerWidgetFolder = {
  id: string;
  name: string;
  serverIds: string[];
};

export type MoreServerFoldersUiState = {
  /** Folder ids expanded in compact (rail) view. */
  expandedInCompact: string[];
  /** Folder ids whose server cards are hidden in full (card) view. */
  collapsedInCard: string[];
};

export type MoreServerFoldersFileV2 = {
  version: 2;
  folders: MoreServerWidgetFolder[];
  ui: MoreServerFoldersUiState;
};

const EMPTY_UI: MoreServerFoldersUiState = {
  expandedInCompact: [],
  collapsedInCard: [],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeFolderEntry(entry: unknown): MoreServerWidgetFolder | null {
  if (!isRecord(entry)) return null;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  const name =
    typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim().slice(0, 48)
      : 'Folder';
  const idsRaw = entry.serverIds;
  if (!Array.isArray(idsRaw)) return null;
  const serverIds: string[] = [];
  const seen = new Set<string>();
  for (const x of idsRaw) {
    if (typeof x !== 'string') continue;
    const sid = x.trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    serverIds.push(sid);
  }
  if (!id) return null;
  return { id, name, serverIds };
}

/**
 * Normalize folder records from disk. Server ids are kept even when not in the
 * current guild list so assignments survive refresh and temporary list changes.
 */
export function normalizeMoreServerFolders(
  raw: unknown,
): MoreServerWidgetFolder[] {
  if (!isRecord(raw)) return [];
  const folders = raw.folders;
  if (!Array.isArray(folders)) return [];
  const out: MoreServerWidgetFolder[] = [];
  const seenFolderIds = new Set<string>();
  for (const entry of folders) {
    const folder = normalizeFolderEntry(entry);
    if (!folder || seenFolderIds.has(folder.id)) continue;
    seenFolderIds.add(folder.id);
    out.push(folder);
  }
  return out;
}

function normalizeUiState(raw: unknown): MoreServerFoldersUiState {
  if (!isRecord(raw)) return { ...EMPTY_UI };
  const pickIds = (key: 'expandedInCompact' | 'collapsedInCard'): string[] => {
    const arr = raw[key];
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of arr) {
      if (typeof x !== 'string') continue;
      const id = x.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  return {
    expandedInCompact: pickIds('expandedInCompact'),
    collapsedInCard: pickIds('collapsedInCard'),
  };
}

export function normalizeMoreServerFoldersFile(
  raw: unknown,
): MoreServerFoldersFileV2 {
  if (!isRecord(raw)) {
    return { version: 2, folders: [], ui: { ...EMPTY_UI } };
  }
  if (raw.version === 2) {
    return {
      version: 2,
      folders: normalizeMoreServerFolders(raw),
      ui: normalizeUiState(raw.ui),
    };
  }
  return {
    version: 2,
    folders: normalizeMoreServerFolders(raw),
    ui: { ...EMPTY_UI },
  };
}

function readRawFromStorage(): unknown {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v2 = localStorage.getItem(STORAGE_KEY_V2);
    if (v2) return JSON.parse(v2) as unknown;
    const v1 = localStorage.getItem(STORAGE_KEY_V1);
    if (v1) return JSON.parse(v1) as unknown;
    return null;
  } catch {
    return null;
  }
}

export function readMoreServerFoldersFile(): MoreServerFoldersFileV2 {
  const file = normalizeMoreServerFoldersFile(readRawFromStorage());
  return file;
}

export function writeMoreServerFoldersFile(
  file: MoreServerFoldersFileV2,
): void {
  if (typeof localStorage === 'undefined') return;
  const payload: MoreServerFoldersFileV2 = {
    version: 2,
    folders: file.folders,
    ui: {
      expandedInCompact: [...file.ui.expandedInCompact],
      collapsedInCard: [...file.ui.collapsedInCard],
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    /* quota / private mode */
  }
}

/** Visible server ids for a folder given the current Extra-servers guild list. */
export function visibleFolderServerIds(
  folder: MoreServerWidgetFolder,
  validServerIds: ReadonlySet<string>,
): string[] {
  return folder.serverIds.filter((id) => validServerIds.has(id));
}
