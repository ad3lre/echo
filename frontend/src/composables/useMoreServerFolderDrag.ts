import { ref } from 'vue';

export const MORE_SERVER_DRAG_MIME = 'application/x-echo-more-server-id';
export const MORE_FOLDER_DRAG_MIME = 'application/x-echo-more-folder-id';

export type MoreServerDropTarget =
  | { kind: 'ungrouped'; index: number }
  | { kind: 'folder'; folderId: string; index: number }
  | { kind: 'folder-order'; index: number };

function readDragServerId(e: DragEvent): string | null {
  const raw = e.dataTransfer?.getData(MORE_SERVER_DRAG_MIME)?.trim();
  return raw || null;
}

function readDragFolderId(e: DragEvent): string | null {
  const raw = e.dataTransfer?.getData(MORE_FOLDER_DRAG_MIME)?.trim();
  return raw || null;
}

/**
 * HTML5 drag-and-drop for Extra servers widget folders (servers + folder reorder).
 */
export function useMoreServerFolderDrag(opts: {
  onServerDrop: (serverId: string, target: MoreServerDropTarget) => void;
  onFolderReorder: (folderId: string, toIndex: number) => void;
}) {
  const draggingServerId = ref<string | null>(null);
  const draggingFolderId = ref<string | null>(null);
  const dropTarget = ref<MoreServerDropTarget | null>(null);

  function clearDragState() {
    draggingServerId.value = null;
    draggingFolderId.value = null;
    dropTarget.value = null;
  }

  function onServerDragStart(serverId: string, e: DragEvent) {
    e.dataTransfer?.setData(MORE_SERVER_DRAG_MIME, serverId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    draggingServerId.value = serverId;
    draggingFolderId.value = null;
  }

  function onFolderDragStart(folderId: string, e: DragEvent) {
    e.stopPropagation();
    e.dataTransfer?.setData(MORE_FOLDER_DRAG_MIME, folderId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    draggingFolderId.value = folderId;
    draggingServerId.value = null;
  }

  function onDragEnd() {
    clearDragState();
  }

  function allowDrop(e: DragEvent) {
    if (readDragServerId(e) || readDragFolderId(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  }

  function onUngroupedDragOver(index: number, e: DragEvent) {
    if (!readDragServerId(e)) return;
    allowDrop(e);
    dropTarget.value = { kind: 'ungrouped', index };
  }

  function onFolderDragOver(folderId: string, index: number, e: DragEvent) {
    const sid = readDragServerId(e);
    const fid = readDragFolderId(e);
    if (sid) {
      allowDrop(e);
      dropTarget.value = { kind: 'folder', folderId, index };
      return;
    }
    if (fid && fid !== folderId) {
      allowDrop(e);
      dropTarget.value = { kind: 'folder-order', index };
    }
  }

  function onFolderOrderDragOver(index: number, e: DragEvent) {
    if (!readDragFolderId(e)) return;
    allowDrop(e);
    dropTarget.value = { kind: 'folder-order', index };
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const target = dropTarget.value;
    const sid = readDragServerId(e);
    const fid = readDragFolderId(e);
    clearDragState();
    if (!target) return;
    if (sid && (target.kind === 'ungrouped' || target.kind === 'folder')) {
      opts.onServerDrop(sid, target);
      return;
    }
    if (fid && target.kind === 'folder-order') {
      opts.onFolderReorder(fid, target.index);
    }
  }

  function isDropTargetActive(target: MoreServerDropTarget): boolean {
    const t = dropTarget.value;
    if (!t || t.kind !== target.kind) return false;
    if (t.kind === 'ungrouped' && target.kind === 'ungrouped') {
      return t.index === target.index;
    }
    if (t.kind === 'folder' && target.kind === 'folder') {
      return t.folderId === target.folderId && t.index === target.index;
    }
    if (t.kind === 'folder-order' && target.kind === 'folder-order') {
      return t.index === target.index;
    }
    return false;
  }

  return {
    draggingServerId,
    draggingFolderId,
    dropTarget,
    onServerDragStart,
    onFolderDragStart,
    onDragEnd,
    onUngroupedDragOver,
    onFolderDragOver,
    onFolderOrderDragOver,
    onDrop,
    isDropTargetActive,
    clearDragState,
  };
}
