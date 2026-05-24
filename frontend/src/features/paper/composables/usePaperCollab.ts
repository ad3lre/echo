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
  emitPaperClaim,
  emitPaperCursor,
  emitPaperLockRequest,
  emitPaperRelease,
  subscribePaperCursors,
  subscribePaperLockRequested,
  subscribePaperLocks,
  subscribePaperWatchers,
} from '@/services/realtime/paperWatchSocketBridge';

export function usePaperCollab(opts: {
  channelId: Ref<string>;
  userId: Ref<string>;
  displayName: Ref<string>;
  canAuthor: Ref<boolean>;
  authoring: Ref<boolean>;
  editor: Ref<Editor | null>;
}) {
  const collabEnabled = ref(false);
  const authorCount = ref(0);
  const locks = ref<PaperBlockLock[]>([]);
  const cursors = ref<PaperRemoteCursor[]>([]);
  const myHeldBlockId = ref<string | null>(null);
  const lockRequest = ref<PaperLockRequestedPayload | null>(null);

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

    if (prevBlockId && prevBlockId !== blockId) {
      emitPaperRelease(channelId, prevBlockId);
      if (myHeldBlockId.value === prevBlockId) {
        myHeldBlockId.value = null;
      }
    }

    if (!blockId) return;
    if (isBlockLockedByOther(blockId)) return;

    emitPaperClaim(channelId, blockId, opts.displayName.value);
    myHeldBlockId.value = blockId;
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
  }

  function dismissLockRequest() {
    lockRequest.value = null;
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
          lockRequest.value = p;
        }
      }),
    ];
  });

  onUnmounted(() => {
    releaseMyLocks();
    unsubs.forEach((fn) => fn());
    unsubs = [];
    if (cursorTimer) clearTimeout(cursorTimer);
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
    lockRequest,
    myHeldBlockId,
    isBlockLockedByOther,
    lockOwnerName,
    onActiveBlockChange,
    requestBlockAccess,
    releaseMyLocks,
    dismissLockRequest,
    resolveBlockRange,
    getCursors: () => cursors.value,
  };
}
