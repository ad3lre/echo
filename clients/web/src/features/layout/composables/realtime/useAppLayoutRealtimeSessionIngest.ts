import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import { createEchoDmActivityHandler } from '@/features/dm/createEchoDmActivityHandler';
import type { useEchoSessionStore } from '@/features/layout/echoSession';
import type {
  EchoDmRealtimeThread,
  EchoDmThreadActivityEvent,
} from '@shared/types';
import {
  createAppLayoutApplyRealtimeAuthorHint,
  createAppLayoutEnsureReplyTargetMessage,
} from './useAppLayoutRealtimeAuthorHints';

type EchoChannelHistory = {
  prefetchUntilMessageVisible?: (
    channelId: string,
    messageId: string,
  ) => unknown;
};

/** DM ingest + author/reply hint factories for the realtime host. */
export function createRealtimeSessionIngest(deps: {
  mergeEchoDmThreadFromRealtime: (
    thread: EchoDmRealtimeThread,
    lastActivityId?: string,
  ) => void;
  workspace: WorkspaceStateApi;
  echoSession: ReturnType<typeof useEchoSessionStore>;
  echoChannelHistory: EchoChannelHistory;
}) {
  const handleEchoDmActivity = createEchoDmActivityHandler({
    mergeEchoDmThreadFromRealtime: deps.mergeEchoDmThreadFromRealtime,
  });

  /**
   * Server-driven inbox sort-key update for activity that has no message/call
   * payload (e.g. friend accepted between the pair). Merging the thread row
   * pulls in the fresh `lastActivityAt` so the inbox reorders without waiting
   * for a `/dm/threads` refresh.
   */
  const handleEchoDmThreadActivity = (payload: EchoDmThreadActivityEvent) => {
    deps.mergeEchoDmThreadFromRealtime(payload.thread);
  };

  const applyRealtimeAuthorHint = createAppLayoutApplyRealtimeAuthorHint({
    workspace: deps.workspace,
    echoSession: deps.echoSession,
  });

  const ensureReplyTargetMessage = createAppLayoutEnsureReplyTargetMessage({
    echoChannelHistory: deps.echoChannelHistory,
  });

  return {
    handleEchoDmActivity,
    handleEchoDmThreadActivity,
    applyRealtimeAuthorHint,
    ensureReplyTargetMessage,
  };
}
