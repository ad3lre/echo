import { ref, watch, computed } from 'vue';
import { useMoreServers } from '@/features/layout/composables/more-servers/useMoreServers';
import {
  readMoreServerFoldersFile,
  writeMoreServerFoldersFile,
  visibleFolderServerIds,
  type MoreServerWidgetFolder,
  type MoreServerFoldersUiState,
} from '@/features/layout/composables/more-servers/moreServerFoldersPersistence';

function newFolderId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export type { MoreServerWidgetFolder };

const folders = ref<MoreServerWidgetFolder[]>([]);
const uiState = ref<MoreServerFoldersUiState>({
  expandedInCompact: [],
  collapsedInCard: [],
});

let watchersBound = false;
let hydrated = false;
let pageHideBound = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeMoreServerFoldersFile({
      version: 2,
      folders: folders.value,
      ui: uiState.value,
    });
  }, 100);
}

function flushPersist() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writeMoreServerFoldersFile({
    version: 2,
    folders: folders.value,
    ui: uiState.value,
  });
}

function hydrateFromDisk() {
  const file = readMoreServerFoldersFile();
  folders.value = file.folders;
  uiState.value = file.ui;
  hydrated = true;
}

function bindWatchersIfNeeded() {
  if (watchersBound) return;
  watchersBound = true;

  const { moreServersList } = useMoreServers();

  const validServerIds = computed(
    () => new Set(moreServersList.value.map((s) => s.id)),
  );

  watch(
    () => moreServersList.value.length,
    () => {
      if (!hydrated) hydrateFromDisk();
    },
    { immediate: true },
  );

  watch(
    folders,
    () => {
      schedulePersist();
    },
    { deep: true },
  );

  watch(
    uiState,
    () => {
      schedulePersist();
    },
    { deep: true },
  );

  if (typeof window !== 'undefined' && !pageHideBound) {
    pageHideBound = true;
    window.addEventListener('pagehide', () => flushPersist());
  }
}

/**
 * Client-only widget folders for the Extra / More servers panel.
 * Persists folder layout, server membership (including dormant ids), and UI expansion.
 */
export function useMoreServerFolders() {
  bindWatchersIfNeeded();
  if (!hydrated) hydrateFromDisk();

  const { moreServersList } = useMoreServers();
  const validServerIds = computed(
    () => new Set(moreServersList.value.map((s) => s.id)),
  );

  function persistNow() {
    flushPersist();
  }

  function addFolder(name?: string): MoreServerWidgetFolder {
    const folder: MoreServerWidgetFolder = {
      id: newFolderId(),
      name: (name?.trim() || 'New folder').slice(0, 48),
      serverIds: [],
    };
    folders.value = [folder, ...folders.value];
    setFolderExpandedInCompact(folder.id, true);
    return folder;
  }

  function reorderFolders(orderedIds: string[]) {
    const byId = new Map(folders.value.map((f) => [f.id, f] as const));
    const next: MoreServerWidgetFolder[] = [];
    const seen = new Set<string>();
    for (const id of orderedIds) {
      const f = byId.get(id);
      if (!f || seen.has(id)) continue;
      seen.add(id);
      next.push(f);
    }
    for (const f of folders.value) {
      if (!seen.has(f.id)) next.push(f);
    }
    folders.value = next;
  }

  function reorderFolderServers(folderId: string, orderedServerIds: string[]) {
    const allowed = new Set(orderedServerIds);
    folders.value = folders.value.map((f) => {
      if (f.id !== folderId) return f;
      const kept = orderedServerIds.filter((id) => f.serverIds.includes(id));
      const rest = f.serverIds.filter((id) => !allowed.has(id));
      return { ...f, serverIds: [...kept, ...rest] };
    });
  }

  function moveServerInFolder(
    serverId: string,
    folderId: string | null,
    insertIndex?: number,
  ) {
    const sid = serverId.trim();
    if (!sid) return;
    let next = folders.value.map((f) => ({
      ...f,
      serverIds: f.serverIds.filter((id) => id !== sid),
    }));
    if (folderId) {
      next = next.map((f) => {
        if (f.id !== folderId) return f;
        const ids = [...f.serverIds];
        const idx =
          insertIndex == null
            ? ids.length
            : Math.max(0, Math.min(insertIndex, ids.length));
        ids.splice(idx, 0, sid);
        return { ...f, serverIds: ids };
      });
    }
    folders.value = next;
  }

  function moveFolder(folderId: string, toIndex: number) {
    const ids = folders.value.map((f) => f.id);
    const from = ids.indexOf(folderId);
    if (from < 0) return;
    ids.splice(from, 1);
    const clamped = Math.max(0, Math.min(toIndex, ids.length));
    ids.splice(clamped, 0, folderId);
    reorderFolders(ids);
  }

  function removeFolder(folderId: string) {
    folders.value = folders.value.filter((f) => f.id !== folderId);
    uiState.value = {
      expandedInCompact: uiState.value.expandedInCompact.filter(
        (id) => id !== folderId,
      ),
      collapsedInCard: uiState.value.collapsedInCard.filter(
        (id) => id !== folderId,
      ),
    };
  }

  function renameFolder(folderId: string, name: string) {
    const n = name.trim().slice(0, 48) || 'Folder';
    folders.value = folders.value.map((f) =>
      f.id === folderId ? { ...f, name: n } : f,
    );
  }

  function setServerFolderMembership(
    serverId: string,
    folderId: string | null,
  ) {
    const sid = serverId.trim();
    if (!sid) return;
    let next = folders.value.map((f) => ({
      ...f,
      serverIds: f.serverIds.filter((id) => id !== sid),
    }));
    if (folderId) {
      next = next.map((f) =>
        f.id === folderId ? { ...f, serverIds: [...f.serverIds, sid] } : f,
      );
    }
    folders.value = next;
  }

  function removeServerFromAllFolders(serverId: string) {
    const sid = serverId.trim();
    if (!sid) return;
    folders.value = folders.value.map((f) => ({
      ...f,
      serverIds: f.serverIds.filter((id) => id !== sid),
    }));
  }

  function folderForServer(serverId: string): MoreServerWidgetFolder | null {
    const sid = serverId.trim();
    return folders.value.find((f) => f.serverIds.includes(sid)) ?? null;
  }

  function isFolderExpandedInCompact(folderId: string): boolean {
    return uiState.value.expandedInCompact.includes(folderId);
  }

  function setFolderExpandedInCompact(folderId: string, expanded: boolean) {
    const next = new Set(uiState.value.expandedInCompact);
    if (expanded) next.add(folderId);
    else next.delete(folderId);
    uiState.value = {
      ...uiState.value,
      expandedInCompact: [...next],
    };
  }

  function toggleFolderExpandedInCompact(folderId: string) {
    setFolderExpandedInCompact(folderId, !isFolderExpandedInCompact(folderId));
  }

  function isFolderCollapsedInCard(folderId: string): boolean {
    return uiState.value.collapsedInCard.includes(folderId);
  }

  function setFolderCollapsedInCard(folderId: string, collapsed: boolean) {
    const next = new Set(uiState.value.collapsedInCard);
    if (collapsed) next.add(folderId);
    else next.delete(folderId);
    uiState.value = {
      ...uiState.value,
      collapsedInCard: [...next],
    };
  }

  function toggleFolderCollapsedInCard(folderId: string) {
    setFolderCollapsedInCard(folderId, !isFolderCollapsedInCard(folderId));
  }

  return {
    folders,
    uiState,
    validServerIds,
    persistNow,
    addFolder,
    removeFolder,
    renameFolder,
    reorderFolders,
    reorderFolderServers,
    moveServerInFolder,
    moveFolder,
    setServerFolderMembership,
    removeServerFromAllFolders,
    folderForServer,
    isFolderExpandedInCompact,
    setFolderExpandedInCompact,
    toggleFolderExpandedInCompact,
    isFolderCollapsedInCard,
    setFolderCollapsedInCard,
    toggleFolderCollapsedInCard,
  };
}
