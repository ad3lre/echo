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

function dropElementFromPointer(e: DragEvent): HTMLElement | null {
  const el = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest('[data-ms-drop]');
  return el instanceof HTMLElement ? el : null;
}

function insertIndexFromMidpoint(
  e: DragEvent,
  el: HTMLElement,
  baseIndex: number,
): number {
  const rect = el.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const raw = e.clientY < mid ? baseIndex : baseIndex + 1;
  return Math.max(0, Number.isFinite(raw) ? raw : 0);
}

/** Block drags that start on nested controls inside a larger draggable row/card. */
export function shouldAbortMoreServerNestedDrag(e: DragEvent): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  const dragRoot = e.currentTarget;
  if (!(dragRoot instanceof Element)) return false;
  const nested = t.closest(
    'button, a, input, textarea, select, [data-no-card-drag]',
  );
  if (!(nested instanceof Element)) return false;
  return nested !== dragRoot && dragRoot.contains(nested);
}

/** Resolve drop target from the element under the pointer (dragover + drop). */
export function resolveMoreServerDropTargetFromPointer(
  e: DragEvent,
  opts?: {
    draggingServerId?: string | null;
    draggingFolderId?: string | null;
  },
): MoreServerDropTarget | null {
  const el = dropElementFromPointer(e);
  if (!el) return null;

  const kind = el.dataset.msDrop;
  const folderDragId =
    opts?.draggingFolderId ??
    e.dataTransfer?.getData(MORE_FOLDER_DRAG_MIME)?.trim() ??
    null;
  const serverDragId =
    opts?.draggingServerId ??
    e.dataTransfer?.getData(MORE_SERVER_DRAG_MIME)?.trim() ??
    null;

  if (kind === 'folder-order') {
    const index = Number(el.dataset.msDropIndex ?? '0');
    return {
      kind: 'folder-order',
      index: Number.isFinite(index) ? index : 0,
    };
  }

  const folderOrderIndex = el.dataset.msFolderOrderIndex;
  const dropFolderId = el.dataset.msDropFolder?.trim();

  if (
    folderDragId &&
    folderOrderIndex != null &&
    dropFolderId &&
    folderDragId !== dropFolderId
  ) {
    const base = Number(folderOrderIndex);
    if (Number.isFinite(base)) {
      return {
        kind: 'folder-order',
        index: insertIndexFromMidpoint(e, el, base),
      };
    }
  }

  if (kind === 'ungrouped' && serverDragId) {
    const base = Number(el.dataset.msDropIndex ?? '0');
    return {
      kind: 'ungrouped',
      index: insertIndexFromMidpoint(e, el, Number.isFinite(base) ? base : 0),
    };
  }

  if (kind === 'folder' && serverDragId && dropFolderId) {
    const base = Number(el.dataset.msDropIndex ?? '0');
    const index = Number.isFinite(base) ? base : 0;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const adjusted =
      index > 0
        ? e.clientY < mid
          ? index - 1
          : index
        : e.clientY < mid
          ? 0
          : 1;
    return {
      kind: 'folder',
      folderId: dropFolderId,
      index: Math.max(0, adjusted),
    };
  }

  if (kind === 'ungrouped') {
    const index = Number(el.dataset.msDropIndex ?? '0');
    return { kind: 'ungrouped', index: Number.isFinite(index) ? index : 0 };
  }

  if (kind === 'folder' && dropFolderId) {
    const index = Number(el.dataset.msDropIndex ?? '0');
    return {
      kind: 'folder',
      folderId: dropFolderId,
      index: Number.isFinite(index) ? index : 0,
    };
  }

  return null;
}

/** @deprecated Use resolveMoreServerDropTargetFromPointer — kept for compatibility. */
export function resolveMoreServerDropTargetFromEvent(
  e: DragEvent,
): MoreServerDropTarget | null {
  return resolveMoreServerDropTargetFromPointer(e);
}

/**
 * HTML5 drag-and-drop for Extra servers widget folders (servers + folder reorder).
 * Capture-phase dragover on the scroll list (see ChannelPanelList) keeps drops working
 * over gaps and child nodes.
 */
export function useMoreServerFolderDrag(opts: {
  onServerDrop: (serverId: string, target: MoreServerDropTarget) => void;
  onFolderReorder: (folderId: string, toIndex: number) => void;
}) {
  const draggingServerId = ref<string | null>(null);
  const draggingFolderId = ref<string | null>(null);
  const dropTarget = ref<MoreServerDropTarget | null>(null);
  const suppressClickAfterDrag = ref(false);

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

  function setDragGhost(e: DragEvent) {
    const dt = e.dataTransfer;
    const current = e.currentTarget;
    if (!dt || !(current instanceof HTMLElement)) return;
    const rect = current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    try {
      dt.setDragImage(current, rect.width / 2, rect.height / 2);
    } catch {
      /* setDragImage may fail on some browsers */
    }
  }

  function onServerDragStart(serverId: string, e: DragEvent) {
    const dt = e.dataTransfer;
    dt?.setData(MORE_SERVER_DRAG_MIME, serverId);
    if (dt) {
      dt.effectAllowed = 'move';
      try {
        dt.setData('text/plain', serverId);
      } catch {
        /* some browsers restrict multiple types */
      }
    }
    setDragGhost(e);
    draggingServerId.value = serverId;
    draggingFolderId.value = null;
    dropTarget.value = null;
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
    setDragGhost(e);
    draggingFolderId.value = folderId;
    draggingServerId.value = null;
    dropTarget.value = null;
  }

  function onDragEnd() {
    const wasDragging = !!(draggingServerId.value || draggingFolderId.value);
    clearDragState();
    if (wasDragging) {
      suppressClickAfterDrag.value = true;
      window.setTimeout(() => {
        suppressClickAfterDrag.value = false;
      }, 50);
    }
  }

  function allowDrop(e: DragEvent) {
    if (isServerDrag(e) || isFolderDrag(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  }

  function syncDropTargetFromPointer(e: DragEvent) {
    const resolved = resolveMoreServerDropTargetFromPointer(e, {
      draggingServerId: draggingServerId.value,
      draggingFolderId: draggingFolderId.value,
    });
    if (resolved) dropTarget.value = resolved;
  }

  /**
   * Attach to the scroll list (`@dragover.capture`) so dragover is not lost on gaps
   * between rows or on nested avatars/text nodes.
   */
  function onPanelDragOverCapture(e: DragEvent) {
    if (!isServerDrag(e) && !isFolderDrag(e)) return;
    allowDrop(e);
    syncDropTargetFromPointer(e);
  }

  function onUngroupedDragOver(index: number, e: DragEvent) {
    if (!isServerDrag(e)) return;
    allowDrop(e);
    dropTarget.value = { kind: 'ungrouped', index };
    syncDropTargetFromPointer(e);
  }

  function onFolderDragOver(folderId: string, index: number, e: DragEvent) {
    if (isServerDrag(e)) {
      allowDrop(e);
      syncDropTargetFromPointer(e);
      if (!dropTarget.value || dropTarget.value.kind !== 'folder') {
        dropTarget.value = { kind: 'folder', folderId, index };
      }
      return;
    }
    const fid = readDragFolderId(e);
    if (isFolderDrag(e) && fid && fid !== folderId) {
      allowDrop(e);
      syncDropTargetFromPointer(e);
      if (!dropTarget.value || dropTarget.value.kind !== 'folder-order') {
        dropTarget.value = { kind: 'folder-order', index };
      }
    }
  }

  function onFolderOrderDragOver(index: number, e: DragEvent) {
    if (!isFolderDrag(e)) return;
    allowDrop(e);
    syncDropTargetFromPointer(e);
    if (!dropTarget.value || dropTarget.value.kind !== 'folder-order') {
      dropTarget.value = { kind: 'folder-order', index };
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const target =
      dropTarget.value ??
      resolveMoreServerDropTargetFromPointer(e, {
        draggingServerId: draggingServerId.value,
        draggingFolderId: draggingFolderId.value,
      });
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
    suppressClickAfterDrag,
    onServerDragStart,
    onFolderDragStart,
    onDragEnd,
    onPanelDragOverCapture,
    onUngroupedDragOver,
    onFolderDragOver,
    onFolderOrderDragOver,
    onDrop,
    isDropTargetActive,
    clearDragState,
  };
}
