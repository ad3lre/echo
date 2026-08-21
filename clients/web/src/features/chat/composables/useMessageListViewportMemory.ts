/**
 * Message list — **session viewport memory authority**.
 *
 * Owns persist / schedule / restore of per-channel scroll memory. Does not own
 * initial-anchor scheduling, jump FAB, or live virtualizer writes beyond the
 * injected commit/restore helpers.
 */

import { nextTick, type Ref } from 'vue';
import { isClientOnlyDmOpenShellChannelId } from '@/features/dm/dmOpenShellChannelId';
import {
  getAnchorMessageIdFromViewport,
  measureMessageTopInContainer,
  type VirtualItemLike,
} from '@/features/chat/domain/messageListPrependAnchor';
import {
  restoreViewportAnchorInContainer,
  VIEWPORT_RESTORE_DOM_RETRY,
  type VirtualizerScrollApi,
} from '@/features/chat/domain/messageListViewportRestore';
import {
  clearMessageListViewport,
  readMessageListViewport,
  writeMessageListViewport,
} from '@/features/chat/composables/messageListViewportStorage';
import type { ScrollIntent } from '@/features/chat/domain/messageListScrollOwnership';
import {
  logMessageList,
  messageListDebugEnabled,
} from '@/features/chat/composables/messageListDebugLog';

export type MessageListViewportVirtualizer = VirtualizerScrollApi & {
  getVirtualItems: () => ReadonlyArray<VirtualItemLike>;
  getTotalSize: () => number;
};

export type UseMessageListViewportMemoryOptions = {
  getContainer: () => HTMLElement | null;
  getVirtualizer: () => MessageListViewportVirtualizer | null | undefined;
  getChannelId: () => string | null | undefined;
  getDisplayOrderedIds: () => readonly string[];
  getMessages: () => Map<string, { id?: string | null }>;
  getEnsureMessageInWindow: () =>
    | ((messageId: string) => Promise<boolean>)
    | undefined;
  followNewMessagesToBottom: Ref<boolean>;
  isSuppressingUntilInitialAnchor: () => boolean;
  canCommitViewportRestore: () => boolean;
  withProgrammaticScroll: <T>(
    write: () => T,
    intent?: ScrollIntent | string,
  ) => T;
  commitScrollToLatest: (options: {
    smooth?: boolean;
    forceScrollToIndex?: boolean;
    intent?: ScrollIntent;
  }) => void;
  distanceFromBottomPx: () => number;
  followNewAttachPx: number;
};

type ViewportMemoryState = {
  raf: number | null;
  options: UseMessageListViewportMemoryOptions;
};

function persistViewportMemoryForChannel(
  state: ViewportMemoryState,
  channelId: string | null | undefined = state.options.getChannelId(),
): void {
  const cid = channelId?.trim();
  if (cid && isClientOnlyDmOpenShellChannelId(cid)) return;
  const el = state.options.getContainer();
  const virtualItems = state.options.getVirtualizer()?.getVirtualItems() ?? [];
  const orderedIds = state.options.getDisplayOrderedIds();
  if (
    !cid ||
    !el ||
    orderedIds.length === 0 ||
    virtualItems.length === 0 ||
    state.options.isSuppressingUntilInitialAnchor()
  ) {
    return;
  }

  const anchor = getAnchorMessageIdFromViewport(
    el,
    virtualItems,
    orderedIds,
    state.options.getMessages(),
  );
  if (!anchor) return;
  const anchorTop = measureMessageTopInContainer(el, anchor.anchorMessageId);
  if (anchorTop == null) return;

  writeMessageListViewport(cid, {
    anchorMessageId: anchor.anchorMessageId,
    anchorTop,
    followNewMessages: state.options.followNewMessagesToBottom.value,
  });

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_saved', {
      channelId: cid,
      anchorMessageId: anchor.anchorMessageId,
      anchorTop,
      followNewMessages: state.options.followNewMessagesToBottom.value,
      messageCount: orderedIds.length,
      outcomeOk: true,
      expectation:
        'channel restore reuses this anchor instead of defaulting to latest',
    });
  }
}

function schedulePersistViewportMemory(state: ViewportMemoryState): void {
  if (state.raf != null) return;
  state.raf = requestAnimationFrame(() => {
    state.raf = null;
    persistViewportMemoryForChannel(state);
  });
}

function disposeViewportMemory(state: ViewportMemoryState): void {
  if (state.raf == null) return;
  cancelAnimationFrame(state.raf);
  state.raf = null;
}

async function ensureAnchorMessageInWindow(
  state: ViewportMemoryState,
  channelId: string,
  anchorMessageId: string,
): Promise<boolean> {
  if (state.options.getDisplayOrderedIds().includes(anchorMessageId)) {
    return true;
  }
  const ensure = state.options.getEnsureMessageInWindow();
  if (!ensure) return false;
  try {
    const ok = await ensure(anchorMessageId);
    if (state.options.getChannelId()?.trim() !== channelId) return false;
    return ok && state.options.getDisplayOrderedIds().includes(anchorMessageId);
  } catch {
    return false;
  }
}

async function waitViewportRestoreFrame(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function restoreFollowNewTail(
  state: ViewportMemoryState,
  channelId: string,
  entry: {
    anchorMessageId: string;
    anchorTop: number;
    followNewMessages: boolean;
  },
): Promise<boolean> {
  if (!state.options.canCommitViewportRestore()) return false;
  let restored = false;
  for (let attempt = 0; attempt < VIEWPORT_RESTORE_DOM_RETRY; attempt++) {
    await waitViewportRestoreFrame();
    if (!state.options.canCommitViewportRestore()) return false;
    const v = state.options.getVirtualizer();
    if (!v || state.options.getDisplayOrderedIds().length === 0) continue;
    state.options.commitScrollToLatest({
      forceScrollToIndex: true,
      intent: 'viewport-restore',
    });
    if (
      state.options.distanceFromBottomPx() < state.options.followNewAttachPx
    ) {
      restored = true;
      break;
    }
  }
  if (!restored) return false;

  persistViewportMemoryForChannel(state, channelId);

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_restored', {
      channelId,
      anchorMessageId: entry.anchorMessageId,
      anchorTopBefore: entry.anchorTop,
      followNewMessages: entry.followNewMessages,
      messageCount: state.options.getDisplayOrderedIds().length,
      outcomeOk: true,
      expectation:
        'returning to a channel at the tail restores the bottom, not an anchor estimate',
    });
  }
  return true;
}

async function restoreMidHistoryAnchor(
  state: ViewportMemoryState,
  channelId: string,
  entry: {
    anchorMessageId: string;
    anchorTop: number;
    followNewMessages: boolean;
  },
): Promise<boolean> {
  const orderedIds = state.options.getDisplayOrderedIds();
  if (!orderedIds.includes(entry.anchorMessageId)) {
    const loaded = await ensureAnchorMessageInWindow(
      state,
      channelId,
      entry.anchorMessageId,
    );
    if (
      !loaded ||
      !state.options.getDisplayOrderedIds().includes(entry.anchorMessageId)
    ) {
      clearMessageListViewport(channelId);
      return false;
    }
    if (!state.options.canCommitViewportRestore()) return false;
  }

  let restored = false;
  for (let attempt = 0; attempt < VIEWPORT_RESTORE_DOM_RETRY; attempt++) {
    await waitViewportRestoreFrame();
    // Restore spans several frames; if the user grabs the scroll mid-restore,
    // abandon it rather than yank them back to the saved anchor.
    if (!state.options.canCommitViewportRestore()) return false;
    const el = state.options.getContainer();
    const v = state.options.getVirtualizer();
    if (!el || !v) continue;
    restored = state.options.withProgrammaticScroll(() =>
      restoreViewportAnchorInContainer(
        el,
        state.options.getDisplayOrderedIds(),
        v,
        {
          anchorMessageId: entry.anchorMessageId,
          anchorTop: entry.anchorTop,
        },
      ),
    );
    if (restored) break;
  }
  if (!restored) return false;

  persistViewportMemoryForChannel(state, channelId);

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_restored', {
      channelId,
      anchorMessageId: entry.anchorMessageId,
      anchorTopBefore: entry.anchorTop,
      followNewMessages: entry.followNewMessages,
      messageCount: state.options.getDisplayOrderedIds().length,
      outcomeOk: true,
      expectation:
        'returning to a channel restores the prior viewport instead of jumping',
    });
  }

  return true;
}

async function restoreViewportMemoryForChannel(
  state: ViewportMemoryState,
  channelId: string,
): Promise<boolean> {
  if (isClientOnlyDmOpenShellChannelId(channelId)) return false;
  const entry = readMessageListViewport(channelId);
  if (!entry || state.options.getDisplayOrderedIds().length === 0) return false;

  state.options.followNewMessagesToBottom.value = entry.followNewMessages;

  if (entry.followNewMessages) {
    return restoreFollowNewTail(state, channelId, entry);
  }
  return restoreMidHistoryAnchor(state, channelId, entry);
}

export function useMessageListViewportMemory(
  options: UseMessageListViewportMemoryOptions,
) {
  const state: ViewportMemoryState = { raf: null, options };

  return {
    persistViewportMemoryForChannel: (channelId?: string | null | undefined) =>
      persistViewportMemoryForChannel(state, channelId),
    schedulePersistViewportMemory: () => schedulePersistViewportMemory(state),
    restoreViewportMemoryForChannel: (channelId: string) =>
      restoreViewportMemoryForChannel(state, channelId),
    dispose: () => disposeViewportMemory(state),
  };
}
