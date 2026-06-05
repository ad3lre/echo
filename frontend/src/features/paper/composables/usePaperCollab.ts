import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import type {
  PaperBlockLock,
  PaperLockRequestedPayload,
  PaperRemoteCursor,
} from '@shared/types/paperCollab';
import { paperAuthorColor } from '@/features/paper/composables/usePaperAuthorGutter';
import {
  blockRelativeSelection,
  paperBlockIdAtPos,
} from '@/features/paper/editor/paperBlockAtPos';
import {
  emitPaperBlockDirty,
  emitPaperBlockPreview,
  emitPaperClaim,
  emitPaperCursor,
  emitPaperLockRequest,
  emitPaperRelease,
  subscribePaperBlockDirty,
  subscribePaperBlockPreviews,
  subscribePaperCursors,
  subscribePaperLockRequested,
  subscribePaperLocks,
  subscribePaperWatchers,
} from '@/services/realtime/paperWatchSocketBridge';

/** Milliseconds of inactivity before releasing a block lock */
const BLOCK_IDLE_RELEASE_MS = 8_000;
/** Milliseconds before auto-granting a lock request */
const LOCK_REQUEST_AUTO_GRANT_MS = 10_000;

export function usePaperCollab(opts: {
  channelId: Ref<string>;
  userId: Ref<string>;
  displayName: Ref<string>;
  canAuthor: Ref<boolean>;
  authoring: Ref<boolean>;
  editor: Ref<Editor | null>;
  /** Called when user starts editing (keystroke in unheld block) */
  onEditStart?: (blockId: string) => void;
}) {
  const collabEnabled = ref(false);
  const authorCount = ref(0);
  const locks = ref<PaperBlockLock[]>([]);
  const cursors = ref<PaperRemoteCursor[]>([]);
  const myHeldBlockId = ref<string | null>(null);
  const lockRequest = ref<PaperLockRequestedPayload | null>(null);

  /** Ephemeral: which blocks are being edited by others */
  const dirtyBlocks = ref<
    { userId: string; blockId: string; displayName: string; color: string }[]
  >([]);
  /** Ephemeral: preview text of blocks being edited */
  const blockPreviews = ref<
    {
      userId: string;
      blockId: string;
      displayName: string;
      color: string;
      previewText: string;
    }[]
  >([]);

  /** Timer for idle lock release */
  let idleReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timer for auto-granting lock requests */
  let autoGrantTimer: ReturnType<typeof setTimeout> | null = null;
  /** Track if we have a pending lock request */
  const pendingLockRequest = ref<PaperLockRequestedPayload | null>(null);

  /** Timer for debouncing block-dirty emits */
  let dirtyEmitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timer for debouncing block-preview emits */
  let previewEmitTimer: ReturnType<typeof setTimeout> | null = null;

  const lockByBlockId = computed(() => {
    const m = new Map<string, PaperBlockLock>();
    for (const l of locks.value) m.set(l.blockId, l);
    return m;
  });

  function isBlockLockedByOther(blockId: string): boolean {
    if (!collabEnabled.value) return false;
    const lock = lockByBlockId.value.get(blockId);
    return !!lock && lock.userId !== opts.userId.value;
  }

  function lockOwnerName(blockId: string): string | null {
    const lock = lockByBlockId.value.get(blockId);
    if (!lock || lock.userId === opts.userId.value) return null;
    return lock.displayName;
  }

  function onActiveBlockChange(
    blockId: string | null,
    prevBlockId: string | null,
  ) {
    if (!collabEnabled.value || !opts.canAuthor.value) return;
    const channelId = opts.channelId.value.trim();
    if (!channelId) return;

    // Only release on cursor change if we're moving to a different block
    // (idle release handles same-block timeout)
    if (prevBlockId && prevBlockId !== blockId) {
      emitPaperRelease(channelId, prevBlockId);
      if (myHeldBlockId.value === prevBlockId) {
        myHeldBlockId.value = null;
      }
    }

    if (!blockId) return;
    // Don't claim just on cursor move - wait for actual edit (keystroke)
    // This prevents accidental claims when scrolling through document
  }

  /** Claim block on first keystroke (edit start) rather than cursor move */
  function onEditStart(blockId: string | null) {
    if (!collabEnabled.value || !opts.canAuthor.value) return;
    if (!blockId) return;
    if (myHeldBlockId.value === blockId) {
      // Already holding this block - reset idle timer and emit dirty/preview
      resetIdleTimer();
      scheduleDirtyEmit(blockId);
      return;
    }
    if (isBlockLockedByOther(blockId)) return;

    const channelId = opts.channelId.value.trim();
    if (!channelId) return;

    // Release any previous block first
    if (myHeldBlockId.value) {
      emitPaperRelease(channelId, myHeldBlockId.value);
    }

    emitPaperClaim(channelId, blockId, opts.displayName.value);
    myHeldBlockId.value = blockId;
    resetIdleTimer();
    scheduleDirtyEmit(blockId);
  }

  /** Debounce block-dirty emits to avoid flooding socket */
  function scheduleDirtyEmit(blockId: string) {
    if (dirtyEmitTimer) return; // Already scheduled
    dirtyEmitTimer = setTimeout(() => {
      dirtyEmitTimer = null;
      const channelId = opts.channelId.value.trim();
      if (!channelId) return;
      emitPaperBlockDirty(
        channelId,
        blockId,
        opts.displayName.value,
        paperAuthorColor(opts.userId.value),
      );
      // Also schedule preview emit (slightly more debounced)
      schedulePreviewEmit(blockId);
    }, 100);
  }

  /** Debounce block-preview emits (heavier payload) */
  function schedulePreviewEmit(blockId: string) {
    if (previewEmitTimer) {
      clearTimeout(previewEmitTimer);
    }
    previewEmitTimer = setTimeout(() => {
      previewEmitTimer = null;
      const ed = opts.editor.value;
      const channelId = opts.channelId.value.trim();
      if (!ed || !channelId) return;

      // Extract preview text from the block
      let previewText = '';
      ed.state.doc.descendants((node, pos) => {
        if (previewText) return false; // Already found
        const id = String(node.attrs.paperBlockId ?? '').trim();
        if (id !== blockId) return;
        // Found the block, extract text content
        previewText = node.textContent?.slice(0, 200) ?? '';
        return false;
      });

      if (previewText) {
        emitPaperBlockPreview(
          channelId,
          blockId,
          previewText,
          opts.displayName.value,
          paperAuthorColor(opts.userId.value),
        );
      }
    }, 300);
  }

  function resetIdleTimer() {
    if (idleReleaseTimer) {
      clearTimeout(idleReleaseTimer);
    }
    idleReleaseTimer = setTimeout(() => {
      // Release lock after idle period
      const held = myHeldBlockId.value;
      if (held) {
        const channelId = opts.channelId.value.trim();
        if (channelId) {
          emitPaperRelease(channelId, held);
        }
        myHeldBlockId.value = null;
      }
      idleReleaseTimer = null;
    }, BLOCK_IDLE_RELEASE_MS);
  }

  function clearIdleTimer() {
    if (idleReleaseTimer) {
      clearTimeout(idleReleaseTimer);
      idleReleaseTimer = null;
    }
  }

  /** Auto-grant lock request after timeout if user is idle */
  function handleLockRequestWithAutoGrant(request: PaperLockRequestedPayload) {
    // Clear any existing auto-grant timer
    if (autoGrantTimer) {
      clearTimeout(autoGrantTimer);
      autoGrantTimer = null;
    }

    pendingLockRequest.value = request;
    lockRequest.value = request;

    autoGrantTimer = setTimeout(() => {
      // Auto-grant if still holding the block
      if (
        myHeldBlockId.value === request.blockId &&
        pendingLockRequest.value?.blockId === request.blockId &&
        pendingLockRequest.value?.fromUserId === request.fromUserId
      ) {
        // Auto-release to grant access
        releaseMyLocks();
        lockRequest.value = null;
        pendingLockRequest.value = null;
      }
      autoGrantTimer = null;
    }, LOCK_REQUEST_AUTO_GRANT_MS);
  }

  let cursorTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleCursorEmit() {
    if (!collabEnabled.value || !opts.authoring.value) return;
    if (cursorTimer) return;
    cursorTimer = setTimeout(() => {
      cursorTimer = null;
      emitCursorNow();
    }, 50);
  }

  function emitCursorNow() {
    const ed = opts.editor.value;
    const channelId = opts.channelId.value.trim();
    if (!ed || !channelId || !collabEnabled.value) return;

    const { from, to } = ed.state.selection;
    const blockId = paperBlockIdAtPos(ed.state.doc, from);
    if (!blockId) return;
    const rel = blockRelativeSelection(ed.state.doc, blockId, from, to);
    if (!rel) return;

    emitPaperCursor(channelId, {
      blockId,
      anchor: rel.anchor,
      head: rel.head,
      displayName: opts.displayName.value,
      color: paperAuthorColor(opts.userId.value),
    });
  }

  function requestBlockAccess(blockId: string) {
    const channelId = opts.channelId.value.trim();
    if (!channelId) return;
    emitPaperLockRequest(channelId, blockId, opts.displayName.value);
  }

  function releaseMyLocks() {
    const channelId = opts.channelId.value.trim();
    if (!channelId) return;
    emitPaperRelease(channelId);
    myHeldBlockId.value = null;
    clearIdleTimer();
    // Cancel any pending auto-grant
    if (autoGrantTimer) {
      clearTimeout(autoGrantTimer);
      autoGrantTimer = null;
    }
    pendingLockRequest.value = null;
  }

  function dismissLockRequest() {
    lockRequest.value = null;
    // Cancel auto-grant if manually dismissed
    if (autoGrantTimer && pendingLockRequest.value) {
      clearTimeout(autoGrantTimer);
      autoGrantTimer = null;
    }
    pendingLockRequest.value = null;
  }

  function resolveBlockRange(blockId: string) {
    const ed = opts.editor.value;
    if (!ed) return null;
    let blockStart = -1;
    let blockEnd = -1;
    ed.state.doc.descendants((node, pos) => {
      if (blockStart >= 0) return false;
      if (String(node.attrs.paperBlockId ?? '').trim() !== blockId) return;
      blockStart = pos;
      blockEnd = pos + node.nodeSize;
      return false;
    });
    if (blockStart < 0) return null;
    let textFrom = blockEnd;
    let textTo = blockStart;
    ed.state.doc.nodesBetween(blockStart, blockEnd, (node, pos) => {
      if (!node.isText || !node.text?.length) return;
      textFrom = Math.min(textFrom, pos);
      textTo = Math.max(textTo, pos + node.text.length);
    });
    if (textFrom >= textTo) {
      textFrom = blockStart + 1;
      textTo = Math.max(blockStart + 1, blockEnd - 1);
    }
    return { textFrom, textTo };
  }

  let unsubs: (() => void)[] = [];

  onMounted(() => {
    unsubs = [
      subscribePaperWatchers((p) => {
        if (p.channelId !== opts.channelId.value.trim()) return;
        authorCount.value = p.authorCount ?? 0;
        collabEnabled.value = p.collabEnabled === true;
        if (!collabEnabled.value) {
          locks.value = [];
          cursors.value = [];
          myHeldBlockId.value = null;
        }
      }),
      subscribePaperLocks((p) => {
        if (p.channelId !== opts.channelId.value.trim()) return;
        locks.value = p.locks;
      }),
      subscribePaperCursors((p) => {
        if (p.channelId !== opts.channelId.value.trim()) return;
        cursors.value = p.cursors;
      }),
      subscribePaperLockRequested((p) => {
        if (p.channelId !== opts.channelId.value.trim()) return;
        if (p.toUserId !== opts.userId.value) return;
        const held = myHeldBlockId.value;
        if (held && p.blockId === held) {
          handleLockRequestWithAutoGrant(p);
        }
      }),
      subscribePaperBlockDirty((p) => {
        if (p.channelId !== opts.channelId.value.trim()) return;
        // Filter out our own entries
        dirtyBlocks.value = p.dirty.filter(
          (d) => d.userId !== opts.userId.value,
        );
      }),
      subscribePaperBlockPreviews((p) => {
        if (p.channelId !== opts.channelId.value.trim()) return;
        // Filter out our own entries
        blockPreviews.value = p.previews.filter(
          (p) => p.userId !== opts.userId.value,
        );
      }),
    ];
  });

  onUnmounted(() => {
    releaseMyLocks();
    unsubs.forEach((fn) => fn());
    unsubs = [];
    if (cursorTimer) clearTimeout(cursorTimer);
    clearIdleTimer();
    if (autoGrantTimer) {
      clearTimeout(autoGrantTimer);
      autoGrantTimer = null;
    }
    if (dirtyEmitTimer) {
      clearTimeout(dirtyEmitTimer);
      dirtyEmitTimer = null;
    }
    if (previewEmitTimer) {
      clearTimeout(previewEmitTimer);
      previewEmitTimer = null;
    }
  });

  watch(
    () => opts.channelId.value,
    () => {
      locks.value = [];
      cursors.value = [];
      collabEnabled.value = false;
      myHeldBlockId.value = null;
    },
  );

  watch(
    () => opts.editor.value,
    (ed, prev) => {
      prev?.off('selectionUpdate', scheduleCursorEmit);
      ed?.on('selectionUpdate', scheduleCursorEmit);
    },
    { immediate: true },
  );

  watch([locks, cursors, collabEnabled], () => {
    const ed = opts.editor.value;
    if (!ed?.view) return;
    ed.view.dispatch(ed.state.tr);
  });

  return {
    collabEnabled,
    authorCount,
    locks,
    cursors,
    dirtyBlocks,
    blockPreviews,
    lockRequest,
    myHeldBlockId,
    isBlockLockedByOther,
    lockOwnerName,
    onActiveBlockChange,
    onEditStart,
    requestBlockAccess,
    releaseMyLocks,
    dismissLockRequest,
    resolveBlockRange,
    getCursors: () => cursors.value,
    getDirtyBlocks: () => dirtyBlocks.value,
    getBlockPreviews: () => blockPreviews.value,
  };
}
