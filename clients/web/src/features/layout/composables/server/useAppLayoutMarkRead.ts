import type { Ref } from 'vue';
import type { useServerStore } from '@/features/layout/server';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useEchoAttentionStore } from '@/features/layout/echoAttention';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { echoDmChannelIdForPeerUser } from '@/features/dm/buildDmPanelUserList';
import { compareEchoTimelineIds } from '@/features/chat/domain/echoMessageReadState';
import { resolveEchoDmWireChannelId } from '@/features/layout/resolveEchoDmWireChannelId';
import { fetchEchoAttentionSummary } from '@/api/echo/attention';
import {
  fetchEchoChannelMessages,
  putEchoChannelReadState,
} from '@/api/echo/messages';
import {
  buildEchoDmMarkReadPlan,
  buildEchoServerMarkReadPlan,
  buildLatestMessageIdByChannelIdForServer,
  resolveEchoMarkReadTargetsForMissingChannels,
  type EchoServerMarkReadPlan,
} from '@/features/layout/echoServerMarkReadTargets';

type DmMarkReadPayload =
  | { kind: 'user'; userId: string }
  | { kind: 'group'; channelId: string };

type EchoMarkReadPlanResult = {
  status: 'ok' | 'empty' | 'failed' | 'unauthenticated';
};

/**
 * Mark-read engine for the layout shell: server-rail / DM-rail "mark all read",
 * single-channel mark-read, and the optimistic plan executor. Reads attention
 * maps directly off the store (call-time reads, no reactive tracking needed).
 */
export function useAppLayoutMarkRead(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoAttention: ReturnType<typeof useEchoAttentionStore>;
  workspace: WorkspaceStateApi;
  serverStore: ReturnType<typeof useServerStore>;
  activeChannelId: Ref<string>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
}) {
  const {
    authSession,
    echoAttention,
    workspace,
    serverStore,
    activeChannelId,
    echoDmPeerByChannelId,
  } = deps;

  function buildServerMarkReadPlanForId(
    serverId: string,
  ): EchoServerMarkReadPlan {
    const sid = serverId.trim();
    return buildEchoServerMarkReadPlan({
      serverId: sid,
      channelAttentionByChannelId: echoAttention.channelAttentionByChannelId,
      readStateByChannelId: echoAttention.readStateByChannelId,
      latestMessageIdByChannelId: buildLatestMessageIdByChannelIdForServer({
        serverId: sid,
        categoriesByServer: workspace.categoriesByServer.value,
        messagesByChannelId: workspace.messages.value,
      }),
      ignoreLocalCursor: true,
    });
  }

  async function executeEchoMarkReadPlan(
    plan: EchoServerMarkReadPlan,
    opts?: { applyOptimistic?: 'server' | 'dm'; refreshAttention?: boolean },
  ): Promise<EchoMarkReadPlanResult> {
    if (!authSession.isAuthenticated) return { status: 'unauthenticated' };
    const token = authSession.accessToken?.trim() ?? '';

    let targets = [...plan.targets];
    let unresolvedMissing = 0;
    if (plan.channelIdsMissingLatestUnread.length > 0) {
      const resolved = await resolveEchoMarkReadTargetsForMissingChannels({
        channelIds: plan.channelIdsMissingLatestUnread,
        fetchLatestMessageId: async (channelId) => {
          const { messages } = await fetchEchoChannelMessages(
            token,
            channelId,
            {
              limit: 1,
            },
          );
          return messages[0]?.id?.trim() ?? null;
        },
      });
      targets = [...targets, ...resolved.targets];
      unresolvedMissing = resolved.unresolvedChannelIds.length;
    }

    if (targets.length === 0 && unresolvedMissing === 0) {
      return { status: 'empty' };
    }

    if (opts?.applyOptimistic) {
      for (const target of targets) {
        echoAttention.applyServerChannelMarkRead(
          target.channelId,
          target.lastReadMessageId,
        );
      }
    }

    let failed = unresolvedMissing;
    for (const target of targets) {
      try {
        await putEchoChannelReadState(
          token,
          target.channelId,
          target.lastReadMessageId,
        );
      } catch {
        failed += 1;
      }
    }

    if (opts?.refreshAttention !== false && failed === 0) {
      try {
        echoAttention.replaceSnapshot(await fetchEchoAttentionSummary(token));
      } catch {
        /* keep optimistic */
      }
    }

    return failed > 0 ? { status: 'failed' } : { status: 'ok' };
  }

  async function markServerAsReadForRail(serverId: string): Promise<void> {
    const result = await executeEchoMarkReadPlan(
      buildServerMarkReadPlanForId(serverId),
      { applyOptimistic: 'server' },
    );
    if (result.status === 'unauthenticated') {
      dispatchAppToast('Sign in to mark servers as read.', 'info');
      return;
    }
    if (result.status === 'empty') {
      dispatchAppToast('No unread channels in this server.', 'info');
      return;
    }
    if (result.status === 'failed') {
      dispatchAppToast('Could not mark all channels as read.', 'warning');
      return;
    }
    dispatchAppToast('Marked server as read.', 'info');
  }

  async function handleServerRailMarkAllRead(): Promise<void> {
    if (!authSession.isAuthenticated) {
      dispatchAppToast('Sign in to mark servers as read.', 'info');
      return;
    }
    const serverIds = [
      ...new Set(
        serverStore.servers
          .map((s) => s.id.trim())
          .filter((id) => id && id !== 'echo'),
      ),
    ];
    let anyTargets = false;
    let failed = 0;
    for (const sid of serverIds) {
      const plan = buildServerMarkReadPlanForId(sid);
      if (
        plan.targets.length > 0 ||
        plan.channelIdsMissingLatestUnread.length > 0
      ) {
        anyTargets = true;
      }
      const result = await executeEchoMarkReadPlan(plan, {
        applyOptimistic: 'server',
        refreshAttention: false,
      });
      if (result.status === 'failed') failed += 1;
    }
    const token = authSession.accessToken?.trim() ?? '';
    if (failed === 0) {
      try {
        echoAttention.replaceSnapshot(await fetchEchoAttentionSummary(token));
      } catch {
        /* keep optimistic */
      }
    }
    if (!anyTargets) {
      dispatchAppToast('No unread channels.', 'info');
    } else if (failed > 0) {
      dispatchAppToast('Could not mark all servers as read.', 'warning');
    } else {
      dispatchAppToast('Marked all servers as read.', 'info');
    }
  }

  async function handleDmRailMarkAllRead(): Promise<void> {
    if (!authSession.isAuthenticated) {
      dispatchAppToast('Sign in to mark DMs as read.', 'info');
      return;
    }
    const msgsRoot = workspace.messages.value;
    const latestMessageIdByChannelId: Record<string, string> = {};
    for (const row of Object.values(
      echoAttention.channelAttentionByChannelId,
    )) {
      if (row.kind !== 'dm') continue;
      const cid = row.channelId.trim();
      if (!cid || latestMessageIdByChannelId[cid]) continue;
      const msgs = msgsRoot[cid] ?? [];
      const last =
        msgs.length > 0 ? String(msgs[msgs.length - 1]?.id ?? '').trim() : '';
      if (last) latestMessageIdByChannelId[cid] = last;
    }
    const plan = buildEchoDmMarkReadPlan({
      channelAttentionByChannelId: echoAttention.channelAttentionByChannelId,
      readStateByChannelId: echoAttention.readStateByChannelId,
      latestMessageIdByChannelId,
      ignoreLocalCursor: true,
    });
    const result = await executeEchoMarkReadPlan(plan, {
      applyOptimistic: 'dm',
    });
    if (result.status === 'empty') {
      dispatchAppToast('No unread DMs.', 'info');
      return;
    }
    if (result.status === 'failed') {
      dispatchAppToast('Could not mark all DMs as read.', 'warning');
      return;
    }
    dispatchAppToast('Marked all DMs as read.', 'info');
  }

  async function markEchoChannelAsRead(
    channelId: string,
    opts?: { emptyMessage?: string; successMessage?: string; silent?: boolean },
  ): Promise<void> {
    const cid = channelId.trim();
    if (!cid) {
      if (!opts?.silent) {
        dispatchAppToast(opts?.emptyMessage ?? 'Nothing to mark read.', 'info');
      }
      return;
    }
    if (!authSession.isAuthenticated) {
      if (!opts?.silent) {
        dispatchAppToast('Sign in to mark channels as read.', 'info');
      }
      return;
    }
    if (!isEchoGraphId(cid)) {
      if (!opts?.silent) {
        dispatchAppToast(
          'Mark as read only works in Echo channels and DMs.',
          'info',
        );
      }
      return;
    }
    const summary = echoAttention.getChannelAttention(cid);
    const latestFromAttention = summary?.latestUnreadMessageId?.trim() ?? '';
    // When latestUnreadMessageId is absent (common for channels never opened or
    // voice channels), fall back to firstUnreadMessageId (valid when unreadCount=1)
    // then to the newest locally-loaded message.
    const firstFromAttention = summary?.firstUnreadMessageId?.trim() ?? '';
    const firstFallback =
      !latestFromAttention && summary?.unreadCount === 1
        ? firstFromAttention
        : '';
    const msgs = workspace.messages.value[cid] ?? [];
    const lastMsgId =
      msgs.length > 0 ? String(msgs[msgs.length - 1]?.id ?? '').trim() : '';
    const targetId = latestFromAttention || firstFallback || lastMsgId;
    if (!targetId) {
      if (!opts?.silent) {
        dispatchAppToast(opts?.emptyMessage ?? 'Nothing to mark read.', 'info');
      }
      return;
    }
    const currentCursor =
      echoAttention.readStateByChannelId[cid] ??
      summary?.lastReadMessageId ??
      null;
    const lr = String(currentCursor ?? '').trim();
    if (lr && compareEchoTimelineIds(lr, targetId) >= 0) {
      if (!opts?.silent) {
        dispatchAppToast('Channel is already up to date.', 'info');
      }
      return;
    }
    echoAttention.applyServerChannelMarkRead(cid, targetId);
    const token = authSession.accessToken?.trim() ?? '';
    try {
      const readState = await putEchoChannelReadState(token, cid, targetId);
      echoAttention.mergeReadStateUpdate(
        cid,
        readState.lastReadMessageId,
        readState.channelAttention,
      );
      if (!opts?.silent) {
        dispatchAppToast(
          opts?.successMessage ?? 'Marked channel as read.',
          'info',
        );
      }
    } catch (e) {
      reportPrimaryFlowFailure(
        'mark_active_channel_read_failed',
        e,
        undefined,
        {
          showBanner: false,
        },
      );
      if (!opts?.silent) {
        dispatchAppToast('Could not mark channel as read.', 'warning');
      }
    }
  }

  async function markActiveChannelAsRead(): Promise<void> {
    const raw = activeChannelId.value?.trim() ?? '';
    const resolved = resolveEchoDmWireChannelId(
      raw,
      echoDmPeerByChannelId.value,
    );
    await markEchoChannelAsRead(resolved);
  }

  async function handleDmMarkRead(payload: DmMarkReadPayload): Promise<void> {
    const channelId =
      payload.kind === 'group'
        ? payload.channelId.trim()
        : (
            echoDmChannelIdForPeerUser(
              payload.userId,
              echoDmPeerByChannelId.value,
            ) ?? ''
          ).trim();
    await markEchoChannelAsRead(channelId, {
      emptyMessage: 'Nothing unread in this DM.',
      successMessage: 'Marked DM as read.',
    });
  }

  async function handleChannelMarkRead(channelId: string): Promise<void> {
    await markEchoChannelAsRead(channelId.trim(), {
      emptyMessage: 'Nothing unread in this channel.',
      successMessage: 'Marked channel as read.',
    });
  }

  return {
    markServerAsReadForRail,
    handleServerRailMarkAllRead,
    handleDmRailMarkAllRead,
    markEchoChannelAsRead,
    markActiveChannelAsRead,
    handleDmMarkRead,
    handleChannelMarkRead,
  };
}
