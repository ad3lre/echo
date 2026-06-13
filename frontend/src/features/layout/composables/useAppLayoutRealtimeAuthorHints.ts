import type { Ref } from 'vue';
import type { useEchoSessionStore } from '@/stores/echoSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import { peerDisplayNamePlaceholder } from '@/features/dm/peerDisplayPlaceholder';

export function createAppLayoutApplyRealtimeAuthorHint(deps: {
  workspace: WorkspaceStateApi;
  echoSession: ReturnType<typeof useEchoSessionStore>;
}): (payload: {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
}) => void {
  return function applyRealtimeAuthorHint(payload: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  }): void {
    const userId = payload.userId.trim();
    if (!userId) return;
    const displayName = payload.displayName?.trim() ?? '';
    const avatarUrl = payload.avatarUrl?.trim() ?? '';
    const rows = deps.workspace.users.value;
    const idx = rows.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      const row = rows[idx]!;
      const placeholder = peerDisplayNamePlaceholder(userId);
      const shouldFillName =
        !!displayName &&
        (!row.name.trim() ||
          row.name === placeholder ||
          row.name.toLowerCase() === 'unknown');
      const shouldFillAvatar = !!avatarUrl && !row.pfp?.trim();
      if (!shouldFillName && !shouldFillAvatar) return;
      const next = rows.slice();
      next[idx] = {
        ...row,
        ...(shouldFillName ? { name: displayName } : {}),
        ...(shouldFillAvatar ? { pfp: avatarUrl } : {}),
      };
      deps.workspace.users.value = next;
      return;
    }
    if (!displayName && !avatarUrl) return;
    deps.workspace.users.value = [
      ...rows,
      {
        id: userId,
        name: displayName || peerDisplayNamePlaceholder(userId),
        pfp: avatarUrl,
        status: deps.echoSession.presenceByUserId[userId] ?? 'offline',
      },
    ];
  };
}

export function createAppLayoutEnsureReplyTargetMessage(deps: {
  echoChannelHistory: {
    prefetchUntilMessageVisible?: (
      channelId: string,
      messageId: string,
    ) => unknown;
  } | null;
}): (channelId: string, messageId: string) => void {
  const ensureReplyTargetMessageLastAttemptMs = new Map<string, number>();
  const ENSURE_REPLY_TARGET_MESSAGE_DEDUP_MS = 30_000;

  return function ensureReplyTargetMessage(
    channelId: string,
    messageId: string,
  ): void {
    if (!channelId || !messageId) return;
    if (!deps.echoChannelHistory?.prefetchUntilMessageVisible) return;
    const key = `${channelId}\u001f${messageId}`;
    const now = Date.now();
    const last = ensureReplyTargetMessageLastAttemptMs.get(key) ?? 0;
    if (now - last < ENSURE_REPLY_TARGET_MESSAGE_DEDUP_MS) return;
    ensureReplyTargetMessageLastAttemptMs.set(key, now);
    void deps.echoChannelHistory.prefetchUntilMessageVisible(
      channelId,
      messageId,
    );
  };
}
