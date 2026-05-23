import { ref } from 'vue';

export const MORE_SERVER_DRAG_MIME = 'application/x-echo-more-server-id';
export const MORE_FOLDER_DRAG_MIME = 'application/x-echo-more-folder-id';

export type MoreServerDropTarget =
  | { kind: 'ungrouped'; index: number }
  | { kind: 'folder'; folderId: string; index: number }
  | { kind: 'folder-order'; index: number };

function transferTypes(e: DragEvent): readonly string[] {
  const types = e.dataTransfer?.types;
  if (!types) return [];
  return Array.from(types);
}

/** Resolve drop target from `data-ms-drop` on the element under the pointer (drop fallback). */
export function resolveMoreServerDropTargetFromEvent(
  e: DragEvent,
): MoreServerDropTarget | null {
  const el = (e.target as Element | null)?.closest('[data-ms-drop]');
  if (!(el instanceof HTMLElement)) return null;
  const kind = el.dataset.msDrop;
  if (kind === 'ungrouped') {
    const index = Number(el.dataset.msDropIndex ?? '0');
    return { kind: 'ungrouped', index: Number.isFinite(index) ? index : 0 };
  }
  if (kind === 'folder') {
    const folderId = el.dataset.msDropFolder?.trim();
    if (!folderId) return null;
    const index = Number(el.dataset.msDropIndex ?? '0');
    return {
      kind: 'folder',
      folderId,
      index: Number.isFinite(index) ? index : 0,
    };
  }
  if (kind === 'folder-order') {
    const index = Number(el.dataset.msDropIndex ?? '0');
    return { kind: 'folder-order', index: Number.isFinite(index) ? index : 0 };
  }
  return null;
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

  function isServerDrag(e: DragEvent): boolean {
    if (draggingServerId.value) return true;
    return transferTypes(e).includes(MORE_SERVER_DRAG_MIME);
  }

  function isFolderDrag(e: DragEvent): boolean {
    if (draggingFolderId.value) return true;
    return transferTypes(e).includes(MORE_FOLDER_DRAG_MIME);
  }

  function readDragServerId(e: DragEvent): string | null {
    const raw = e.dataTransfer?.getData(MORE_SERVER_DRAG_MIME)?.trim();
    if (raw) return raw;
    return draggingServerId.value;
  }

  function readDragFolderId(e: DragEvent): string | null {
    const raw = e.dataTransfer?.getData(MORE_FOLDER_DRAG_MIME)?.trim();
    if (raw) return raw;
    return draggingFolderId.value;
  }

  function onServerDragStart(serverId: string, e: DragEvent) {
    const dt = e.dataTransfer;
    dt?.setData(MORE_SERVER_DRAG_MIME, serverId);
    // Browsers often block getData() during dragover; types still include our MIME.
    if (dt) {
      dt.effectAllowed = 'move';
      try {
        dt.setData('text/plain', serverId);
      } catch {
        /* some browsers restrict multiple types */
      }
    }
    draggingServerId.value = serverId;
    draggingFolderId.value = null;
  }

  function onFolderDragStart(folderId: string, e: DragEvent) {
    e.stopPropagation();
    const dt = e.dataTransfer;
    dt?.setData(MORE_FOLDER_DRAG_MIME, folderId);
    if (dt) {
      dt.effectAllowed = 'move';
      try {
        dt.setData('text/plain', folderId);
      } catch {
        /* ignore */
      }
    }
    draggingFolderId.value = folderId;
    draggingServerId.value = null;
  }

  function onDragEnd() {
    clearDragState();
  }

  function allowDrop(e: DragEvent) {
    if (isServerDrag(e) || isFolderDrag(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  }

  function onUngroupedDragOver(index: number, e: DragEvent) {
    if (!isServerDrag(e)) return;
    allowDrop(e);
    dropTarget.value = { kind: 'ungrouped', index };
  }

  function onFolderDragOver(folderId: string, index: number, e: DragEvent) {
    if (isServerDrag(e)) {
      allowDrop(e);
      dropTarget.value = { kind: 'folder', folderId, index };
      return;
    }
    const fid = readDragFolderId(e);
    if (isFolderDrag(e) && fid && fid !== folderId) {
      allowDrop(e);
      dropTarget.value = { kind: 'folder-order', index };
    }
  }

  function onFolderOrderDragOver(index: number, e: DragEvent) {
    if (!isFolderDrag(e)) return;
    allowDrop(e);
    dropTarget.value = { kind: 'folder-order', index };
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const target = dropTarget.value ?? resolveMoreServerDropTargetFromEvent(e);
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
