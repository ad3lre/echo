import { ref, computed, type Ref } from 'vue';
import type { useMoreServerFolders } from '@/features/layout/composables/more-servers/useMoreServerFolders';
import type { WidgetFolderContextMenu } from '@/features/layout/composables/more-servers/useMoreServersMenus';

type FolderApi = ReturnType<typeof useMoreServerFolders>;

/**
 * Folder modal (create/edit/delete) + folder context-menu actions for the
 * More-servers panel. Bridges the folder store to the panel's context menu;
 * extracted from MoreServersPanel.vue.
 */
export function useMoreServersFolders(
  deps: Pick<
    FolderApi,
    | 'folders'
    | 'addFolder'
    | 'removeFolder'
    | 'renameFolder'
    | 'moveServerInFolder'
    | 'setServerFolderMembership'
    | 'setFolderExpandedInCompact'
    | 'toggleFolderExpandedInCompact'
    | 'toggleFolderCollapsedInCard'
    | 'isFolderExpandedInCompact'
    | 'isFolderCollapsedInCard'
  > & {
    compact: () => boolean;
    contextMenu: Ref<WidgetFolderContextMenu | null>;
    closeContextMenu: () => void;
    openMenuId: Ref<string | null>;
  },
) {
  const {
    folders,
    addFolder,
    removeFolder,
    renameFolder,
    moveServerInFolder,
    setServerFolderMembership,
    setFolderExpandedInCompact,
    toggleFolderExpandedInCompact,
    toggleFolderCollapsedInCard,
    isFolderExpandedInCompact,
    isFolderCollapsedInCard,
    compact,
    contextMenu,
    closeContextMenu,
    openMenuId,
  } = deps;

  const folderModalOpen = ref(false);
  const folderModalMode = ref<'create' | 'edit'>('create');
  const folderModalTargetId = ref<string | null>(null);
  const pendingServerForNewFolder = ref<string | null>(null);

  const folderModalInitialName = computed(() => {
    if (folderModalMode.value !== 'edit' || !folderModalTargetId.value)
      return '';
    return (
      folders.value.find((f) => f.id === folderModalTargetId.value)?.name ?? ''
    );
  });

  const folderModalServerCount = computed(() => {
    if (!folderModalTargetId.value) return 0;
    const f = folders.value.find((x) => x.id === folderModalTargetId.value);
    return f?.serverIds.length ?? 0;
  });

  function openCreateFolderModal() {
    folderModalMode.value = 'create';
    folderModalTargetId.value = null;
    folderModalOpen.value = true;
  }

  function openEditFolderModal(folderId: string) {
    folderModalMode.value = 'edit';
    folderModalTargetId.value = folderId;
    folderModalOpen.value = true;
    setFolderExpandedInCompact(folderId, true);
    closeContextMenu();
  }

  function onFolderModalSave(name: string) {
    if (folderModalMode.value === 'create') {
      const f = addFolder(name);
      const sid = pendingServerForNewFolder.value;
      if (sid) {
        moveServerInFolder(sid, f.id, 0);
        pendingServerForNewFolder.value = null;
      }
    } else if (folderModalTargetId.value) {
      renameFolder(folderModalTargetId.value, name);
    }
  }

  function onFolderModalDelete() {
    const id = folderModalTargetId.value;
    if (!id) return;
    removeFolder(id);
    folderModalTargetId.value = null;
  }

  function onCreateWidgetFolder() {
    pendingServerForNewFolder.value = null;
    openCreateFolderModal();
  }

  function assignServerToFolder(serverId: string, folderId: string | null) {
    setServerFolderMembership(serverId, folderId);
    openMenuId.value = null;
    closeContextMenu();
  }

  function assignServerToFolderFromMenu(folderId: string | null) {
    const m = contextMenu.value;
    if (!m || m.target !== 'server') return;
    assignServerToFolder(m.serverId, folderId);
  }

  function newFolderFromContextMenu() {
    const m = contextMenu.value;
    if (!m || m.target !== 'server') return;
    newFolderWithServer(m.serverId);
  }

  function newFolderWithServer(serverId: string) {
    pendingServerForNewFolder.value = serverId;
    openCreateFolderModal();
    openMenuId.value = null;
    closeContextMenu();
  }

  function contextMenuToggleFolderLayout() {
    const m = contextMenu.value;
    if (!m || m.target !== 'folder') return;
    if (compact()) {
      toggleFolderExpandedInCompact(m.folderId);
    } else {
      toggleFolderCollapsedInCard(m.folderId);
    }
    closeContextMenu();
  }

  const contextMenuFolderExpandedLabel = computed(() => {
    const m = contextMenu.value;
    if (!m || m.target !== 'folder') return '';
    if (compact()) {
      return isFolderExpandedInCompact(m.folderId)
        ? 'Collapse folder'
        : 'Expand folder';
    }
    return isFolderCollapsedInCard(m.folderId)
      ? 'Show servers'
      : 'Hide servers';
  });

  const contextMenuFolderName = computed(() => {
    const m = contextMenu.value;
    if (!m || m.target !== 'folder') return 'Folder';
    return folders.value.find((f) => f.id === m.folderId)?.name ?? 'Folder';
  });

  function contextMenuEditFolder() {
    const m = contextMenu.value;
    if (!m || m.target !== 'folder') return;
    openEditFolderModal(m.folderId);
  }

  function contextMenuDeleteFolder() {
    contextMenuEditFolder();
  }

  return {
    folderModalOpen,
    folderModalMode,
    folderModalInitialName,
    folderModalServerCount,
    openCreateFolderModal,
    onFolderModalSave,
    onFolderModalDelete,
    onCreateWidgetFolder,
    assignServerToFolder,
    assignServerToFolderFromMenu,
    newFolderFromContextMenu,
    newFolderWithServer,
    contextMenuToggleFolderLayout,
    contextMenuFolderExpandedLabel,
    contextMenuFolderName,
    contextMenuEditFolder,
    contextMenuDeleteFolder,
  };
}
