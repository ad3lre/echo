import { ref, computed, type ComputedRef, type Ref } from 'vue';
import type { MoreServersMockServer } from '@/features/layout/composables/more-servers/useMoreServers';
import type { MoreServerWidgetFolder } from '@/features/layout/composables/more-servers/useMoreServerFolders';
import { visibleFolderServerIds } from '@/features/layout/composables/more-servers/moreServerFoldersPersistence';

export type MoreServersCardStackItem =
  | {
      type: 'folderLabel';
      key: string;
      folder: MoreServerWidgetFolder;
      folderOrderIndex: number;
    }
  | { type: 'ungroupedLabel'; key: string }
  | {
      type: 'server';
      key: string;
      server: MoreServersMockServer;
      topSpacer: boolean;
      folderId?: string;
      serverIndexInFolder?: number;
      ungroupedIndex?: number;
      /** When this row sits under a widget folder header, show a subtle chip. */
      inFolderName?: string;
    };

export type MoreServersCompactRow =
  | { kind: 'server'; server: MoreServersMockServer; ungroupedIndex: number }
  | { kind: 'ungroupedLabel' }
  | {
      kind: 'folder';
      folder: MoreServerWidgetFolder;
      servers: MoreServersMockServer[];
      folderOrderIndex: number;
    };

/**
 * Derived row/list layout for the More-servers panel (card-stack + compact
 * views, folder grouping, ungrouped search). Pure derivation over the panel's
 * reactive inputs; extracted from MoreServersPanel.vue to keep that SFC focused.
 */
export function useMoreServersLayout(opts: {
  servers: ComputedRef<MoreServersMockServer[]>;
  folders: Ref<MoreServerWidgetFolder[]>;
  validServerIds: ComputedRef<Set<string>>;
  isPinned: (id: string) => boolean;
  isFolderCollapsedInCard: (folderId: string) => boolean;
}) {
  const { folders, validServerIds, isPinned, isFolderCollapsedInCard } = opts;
  const mockServers = opts.servers;

  const sortedServers = computed(() => {
    const all = mockServers.value;
    const pinned = all.filter((s) => isPinned(s.id));
    const unpinned = all.filter((s) => !isPinned(s.id));
    return [...pinned, ...unpinned];
  });

  const serverById = computed(
    () => new Map(sortedServers.value.map((s) => [s.id, s] as const)),
  );

  const idsInAnyFolder = computed(() => {
    const ids = new Set<string>();
    for (const f of folders.value) for (const id of f.serverIds) ids.add(id);
    return ids;
  });

  const ungroupedServers = computed(() =>
    sortedServers.value.filter((s) => !idsInAnyFolder.value.has(s.id)),
  );

  const otherServersSearchQuery = ref('');

  const normalizedOtherServersSearch = computed(() =>
    otherServersSearchQuery.value.trim().toLowerCase(),
  );

  const filteredUngroupedServers = computed(() => {
    const q = normalizedOtherServersSearch.value;
    if (!q) return ungroupedServers.value;
    return ungroupedServers.value.filter((s) =>
      s.name.toLowerCase().includes(q),
    );
  });

  const showOtherServersSearch = computed(
    () => ungroupedServers.value.length > 0,
  );

  const foldersWithServers = computed(() =>
    folders.value.map((folder) => ({
      folder,
      servers: visibleFolderServerIds(folder, validServerIds.value)
        .map((id) => serverById.value.get(id))
        .filter((x): x is MoreServersMockServer => !!x),
    })),
  );

  const foldersWithServersMap = computed(
    () =>
      new Map(foldersWithServers.value.map((x) => [x.folder.id, x] as const)),
  );

  const FOLDER_ICON_PEEK_MAX = 4;

  function folderPeekServers(
    servers: MoreServersMockServer[],
  ): MoreServersMockServer[] {
    return servers.slice(0, FOLDER_ICON_PEEK_MAX);
  }

  const cardStack = computed((): MoreServersCardStackItem[] => {
    const out: MoreServersCardStackItem[] = [];
    let folderOrderIndex = 0;
    for (const { folder, servers } of foldersWithServers.value) {
      out.push({
        type: 'folderLabel',
        key: `h-${folder.id}`,
        folder,
        folderOrderIndex: folderOrderIndex++,
      });
      if (isFolderCollapsedInCard(folder.id)) continue;
      servers.forEach((server, serverIndexInFolder) => {
        out.push({
          type: 'server',
          key: `f-${folder.id}-${server.id}`,
          server,
          topSpacer: false,
          folderId: folder.id,
          serverIndexInFolder,
          inFolderName: folder.name,
        });
      });
    }
    let ungroupedIndex = 0;
    if (
      (ungroupedServers.value.length > 0 ||
        normalizedOtherServersSearch.value.length > 0) &&
      foldersWithServers.value.length > 0
    ) {
      out.push({ type: 'ungroupedLabel', key: 'ungrouped-label' });
    }
    for (const server of filteredUngroupedServers.value) {
      out.push({
        type: 'server',
        key: `u-${server.id}`,
        server,
        topSpacer: false,
        ungroupedIndex: ungroupedIndex++,
      });
    }
    return out;
  });

  const compactRows = computed((): MoreServersCompactRow[] => {
    const rows: MoreServersCompactRow[] = [];
    let folderOrderIndex = 0;
    for (const folder of folders.value) {
      const servers = visibleFolderServerIds(folder, validServerIds.value)
        .map((id) => serverById.value.get(id))
        .filter((x): x is MoreServersMockServer => !!x);
      rows.push({
        kind: 'folder',
        folder,
        servers,
        folderOrderIndex: folderOrderIndex++,
      });
    }
    if (
      (ungroupedServers.value.length > 0 ||
        normalizedOtherServersSearch.value.length > 0) &&
      folders.value.length > 0
    ) {
      rows.push({ kind: 'ungroupedLabel' });
    }
    let ungroupedIndex = 0;
    for (const server of filteredUngroupedServers.value) {
      rows.push({ kind: 'server', server, ungroupedIndex: ungroupedIndex++ });
    }
    return rows;
  });

  return {
    serverById,
    otherServersSearchQuery,
    normalizedOtherServersSearch,
    filteredUngroupedServers,
    showOtherServersSearch,
    foldersWithServers,
    foldersWithServersMap,
    folderPeekServers,
    cardStack,
    compactRows,
  };
}
