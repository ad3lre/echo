import { ref, watch } from 'vue';
import { useServerStore } from '@/stores/server';
import {
  readMoreServerFoldersFile,
  writeMoreServerFoldersFile,
  type MoreServerWidgetFolder,
} from '@/utils/moreServerFoldersPersistence';

function newFolderId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export type { MoreServerWidgetFolder };

const folders = ref<MoreServerWidgetFolder[]>([]);
let watchersBound = false;

function bindWatchersIfNeeded() {
  if (watchersBound) return;
  watchersBound = true;
  const serverStore = useServerStore();

  watch(
    () => [...serverStore.servers.map((s) => s.id)].sort().join('\n'),
    () => {
      const valid = new Set(serverStore.servers.map((s) => s.id));
      if (!folders.value.length) {
        folders.value = readMoreServerFoldersFile(valid).folders;
        return;
      }
      folders.value = folders.value.map((f) => ({
        ...f,
        serverIds: f.serverIds.filter((id) => valid.has(id)),
      }));
    },
    { immediate: true },
  );

  watch(
    folders,
    (next) => {
      writeMoreServerFoldersFile({ folders: next });
    },
    { deep: true },
  );
}

/**
 * Client-only “widget folders” for the Extra / More servers panel (overflow guilds).
 * Lets users group servers like Discord’s compact server folders — local persistence only.
 * Singleton: safe to call from multiple components; shares one `folders` list.
 */
export function useMoreServerFolders() {
  bindWatchersIfNeeded();

  function persistNow() {
    writeMoreServerFoldersFile({ folders: folders.value });
  }

  function addFolder(name?: string): MoreServerWidgetFolder {
    const folder: MoreServerWidgetFolder = {
      id: newFolderId(),
      name: (name?.trim() || 'New folder').slice(0, 48),
      serverIds: [],
    };
    folders.value = [...folders.value, folder];
    return folder;
  }

  function removeFolder(folderId: string) {
    folders.value = folders.value.filter((f) => f.id !== folderId);
  }

  function renameFolder(folderId: string, name: string) {
    const n = name.trim().slice(0, 48) || 'Folder';
    folders.value = folders.value.map((f) =>
      f.id === folderId ? { ...f, name: n } : f,
    );
  }

  /** Remove id from every folder, then optionally append to one folder’s list. */
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

  function folderForServer(serverId: string): MoreServerWidgetFolder | null {
    const sid = serverId.trim();
    return folders.value.find((f) => f.serverIds.includes(sid)) ?? null;
  }

  return {
    folders,
    persistNow,
    addFolder,
    removeFolder,
    renameFolder,
    setServerFolderMembership,
    folderForServer,
  };
}
