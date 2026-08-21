import { computed, type ComputedRef, type Ref } from 'vue';
import type { LiveKitVoiceRoomApi } from '@/features/voice/livekitVoiceRoom.types';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import { createStableGoToMessageDelegate } from '@/features/layout/actions/appActionRegistry';
import type { AppActionRegistryRuntime } from '@/features/layout/actions/appActionRegistry.types';
import type { MainSurface } from '@/features/layout/mainSurface';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useEchoSessionStore } from '@/features/layout/echoSession';
import type { EchoDmRealtimeThread, EchoWorkspaceEvent } from '@shared/types';
import type { DmCallSocketSubmitters } from '../dm/useAppLayoutDmCalls';
import { createRealtimeSessionIngest } from './useAppLayoutRealtimeSessionIngest';
import { wireRealtimeSessionPostSocket } from './useAppLayoutRealtimeSessionPostSocket';
import {
  createAppLayoutVoiceE2eeEpochSupersededHandler,
  createAppLayoutVoiceMlsMessageHandler,
} from './useAppLayoutRealtimeE2eeCallbacks';
import { useAppLayoutPinsIntegration } from '../messaging/useAppLayoutPinsIntegration';
import { useAppLayoutRealtimeHostWiring } from './useAppLayoutRealtimeHostWiring';
import {
  useAppLayoutRealtimeSocketBinding,
  type AppLayoutEchoRealtimeHostCallbacks,
} from './useAppLayoutRealtimeSocketBinding';

type EchoChannelHistory = {
  hydrateAttentionSnapshot: () => void | Promise<void>;
  applyEchoChannelClientCap: (channelId: string) => void;
  scheduleActiveChannelTailSyncAfterConnect?: (reason: string) => void;
  syncActiveChannelTailFromApi?: (reason: string) => void | Promise<void>;
  prefetchUntilMessageVisible?: (
    channelId: string,
    messageId: string,
  ) => unknown;
};

export type UseAppLayoutRealtimeSessionDeps = {
  workspace: WorkspaceStateApi;
  echoSession: ReturnType<typeof useEchoSessionStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  platform: { session: { setLiveSyncConnected: (c: boolean) => void } } | null;
  actionRegistryRef: Ref<AppActionRegistryRuntime>;
  mainSurface: Ref<MainSurface>;
  activeChannelId: Ref<string>;
  currentUserIdForSocket: ComputedRef<string | undefined>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmThreadIds: Ref<Set<string>>;
  echoChannelHistory: EchoChannelHistory;
  liveChannelCapabilitiesRefreshKey: Ref<number>;
  hydrateEchoFromApi: () => void | Promise<unknown>;
  refreshEchoSocialFromApi: () => void | Promise<unknown>;
  syncEchoPresenceFromApi: () => void | Promise<unknown>;
  applyEchoPresenceFromSocket: AppLayoutEchoRealtimeHostCallbacks['onPresenceUpdate'];
  mergeEchoDmThreadFromRealtime: (
    thread: EchoDmRealtimeThread,
    lastActivityId?: string,
  ) => void;
  handleEchoDmCall: AppLayoutEchoRealtimeHostCallbacks['onDmCall'];
  mergeReadStateUpdate: AppLayoutEchoRealtimeHostCallbacks['mergeReadStateUpdate'];
  replaceAttentionSnapshot: AppLayoutEchoRealtimeHostCallbacks['replaceAttentionSnapshot'];
  currentVoiceChannelId: Ref<string | null | undefined>;
  dmLiveKitJoinChannelId: Ref<string | null | undefined>;
  getLiveKitVoiceApi: () => LiveKitVoiceRoomApi | null | undefined;
  rejoinDmCallVoice: () => void;
  reconnectGuildVoiceAfterE2eeRotation: () => Promise<void>;
  applyVoiceMediaModerationFromSocket?: (payload: EchoWorkspaceEvent) => void;
  wireDmCallSocketSubmitters: (next: DmCallSocketSubmitters | null) => void;
};

function wirePins(deps: UseAppLayoutRealtimeSessionDeps) {
  const handleGoToMessageDelegated = createStableGoToMessageDelegate(
    () => deps.actionRegistryRef.value,
  );
  const pinsEnabled = computed(
    () => deps.mainSurface.value.type === 'dmThread',
  );
  const pinsIntegration = useAppLayoutPinsIntegration({
    pinsEnabled,
    activeChannelId: deps.activeChannelId,
    echoDmPeerByChannelId: deps.echoDmPeerByChannelId,
    echoDmThreadIds: deps.echoDmThreadIds,
    messages: deps.workspace.messages,
    users: deps.workspace.users,
    authSession: deps.authSession,
    handleGoToMessage: handleGoToMessageDelegated,
  });
  return { handleGoToMessageDelegated, pinsEnabled, pinsIntegration };
}

function wireHost(
  deps: UseAppLayoutRealtimeSessionDeps,
  ingest: ReturnType<typeof createRealtimeSessionIngest>,
  pins: ReturnType<typeof useAppLayoutPinsIntegration>,
) {
  return useAppLayoutRealtimeHostWiring({
    echoSession: deps.echoSession,
    liveChannelCapabilitiesRefreshKey: deps.liveChannelCapabilitiesRefreshKey,
    hydrateEchoFromApi: deps.hydrateEchoFromApi,
    refreshEchoSocialFromApi: deps.refreshEchoSocialFromApi,
    syncEchoPresenceFromApi: deps.syncEchoPresenceFromApi,
    echoChannelHistory: deps.echoChannelHistory,
    applyEchoPresenceFromSocket: deps.applyEchoPresenceFromSocket,
    handleEchoDmActivity: ingest.handleEchoDmActivity,
    handleEchoDmCall: deps.handleEchoDmCall,
    handleEchoDmThreadActivity: ingest.handleEchoDmThreadActivity,
    mergeReadStateUpdate: deps.mergeReadStateUpdate,
    replaceAttentionSnapshot: deps.replaceAttentionSnapshot,
    setChannelPinsFromEcho: pins.setChannelPinsFromEcho,
    restorePinnedIds: pins.setPinnedMessageIdsForChannel,
    applyRealtimeAuthorHint: ingest.applyRealtimeAuthorHint,
    onVoiceE2eeEpochSuperseded: createAppLayoutVoiceE2eeEpochSupersededHandler({
      currentVoiceChannelId: deps.currentVoiceChannelId,
      dmLiveKitJoinChannelId: deps.dmLiveKitJoinChannelId,
      getLiveKitVoiceApi: deps.getLiveKitVoiceApi,
      rejoinDmCallVoice: deps.rejoinDmCallVoice,
      reconnectGuildVoiceAfterE2eeRotation:
        deps.reconnectGuildVoiceAfterE2eeRotation,
    }),
    onVoiceMlsMessage: createAppLayoutVoiceMlsMessageHandler({
      currentVoiceChannelId: deps.currentVoiceChannelId,
      dmLiveKitJoinChannelId: deps.dmLiveKitJoinChannelId,
      getLiveKitVoiceApi: deps.getLiveKitVoiceApi,
    }),
    applyVoiceMediaModerationFromSocket:
      deps.applyVoiceMediaModerationFromSocket,
  });
}

function wireSocket(
  deps: UseAppLayoutRealtimeSessionDeps,
  hostCallbacks: AppLayoutEchoRealtimeHostCallbacks,
  ensureReplyTargetMessage: (channelId: string, messageId: string) => void,
) {
  return useAppLayoutRealtimeSocketBinding({
    messages: deps.workspace.messages,
    activeChannelId: deps.activeChannelId,
    currentUserId: deps.currentUserIdForSocket,
    hostCallbacks,
    getAuthKey: () =>
      // Generation counter covers cookie-mode rotations where accessToken stays
      // null (guest upgrade, re-login): the socket must recycle to drop the old
      // session's identity.
      [
        deps.authSession.isAuthenticated,
        deps.authSession.accessToken,
        deps.authSession.authStateGeneration,
      ] as const,
    platformSession: deps.platform?.session ?? null,
    getBackendUserStatus: () => deps.authSession.backendUser?.status,
    restoreSessionFromApi: () => deps.authSession.restoreSessionFromApi(),
    getLocalAuthorEcho: () => {
      const uid = deps.currentUserIdForSocket.value;
      const u = deps.authSession.backendUser;
      if (!uid || !u || u.id !== uid) return undefined;
      const displayName = u.displayName?.trim() || u.username?.trim();
      if (!displayName) return undefined;
      const avatar = u.pfp?.trim();
      return { displayName, ...(avatar ? { avatar } : {}) };
    },
    getDmPeerUserId: (cid: string) => deps.echoDmPeerByChannelId.value.get(cid),
    getAccessToken: () => deps.authSession.accessToken,
    ensureReplyTargetMessage,
    onTabResumeWhileConnected: () => {
      void deps.echoChannelHistory.syncActiveChannelTailFromApi?.('tab_resume');
    },
  });
}

function buildSessionReturn(args: {
  ingest: ReturnType<typeof createRealtimeSessionIngest>;
  pinsBag: ReturnType<typeof wirePins>;
  hostCallbacks: AppLayoutEchoRealtimeHostCallbacks;
  socket: ReturnType<typeof useAppLayoutRealtimeSocketBinding>;
  post: ReturnType<typeof wireRealtimeSessionPostSocket>;
  wireDmCallSocketSubmitters: UseAppLayoutRealtimeSessionDeps['wireDmCallSocketSubmitters'];
}) {
  const { ingest, pinsBag, hostCallbacks, socket, post } = args;
  const { pinsIntegration } = pinsBag;
  return {
    ...ingest,
    handleGoToMessageDelegated: pinsBag.handleGoToMessageDelegated,
    pinsEnabled: pinsBag.pinsEnabled,
    pinsIntegration,
    pinChannelId: pinsIntegration.pinChannelId,
    isPinsDropdownOpen: pinsIntegration.isPinsDropdownOpen,
    pinsButtonRefDm: pinsIntegration.pinsButtonRefDm,
    pinsButtonRefServer: pinsIntegration.pinsButtonRefServer,
    pinsDropdownRect: pinsIntegration.pinsDropdownRect,
    pinnedMessageIdsForCurrentChannel:
      pinsIntegration.pinnedMessageIdsForCurrentChannel,
    pinnedMessagesForDropdown: pinsIntegration.pinnedMessagesForDropdown,
    closePinsDropdown: pinsIntegration.closePinsDropdown,
    togglePinsDropdown: pinsIntegration.togglePinsDropdown,
    goToPinnedMessage: pinsIntegration.goToPinnedMessage,
    pinMessage: pinsIntegration.pinMessage,
    unpinMessage: pinsIntegration.unpinMessage,
    pinPreview: pinsIntegration.pinPreview,
    setChannelPinsFromEcho: pinsIntegration.setChannelPinsFromEcho,
    setPinnedMessageIdsForChannel:
      pinsIntegration.setPinnedMessageIdsForChannel,
    getPinnedIdsSnapshot: pinsIntegration.getPinnedIdsSnapshot,
    hostCallbacks,
    sendMessageViaSocket: socket.sendMessage,
    submitPollVoteViaSocket: socket.submitPollVote,
    submitReactionToggleViaSocket: socket.submitReactionToggle,
    submitPinViaSocket: socket.submitPin,
    submitUnpinViaSocket: socket.submitUnpin,
    submitMessageEditViaSocket: socket.submitMessageEdit,
    submitImageSlotFillViaSocket: socket.submitImageSlotFill,
    submitMessageDeleteViaSocket: socket.submitMessageDelete,
    submitDmCallInviteViaSocket: socket.submitDmCallInvite,
    submitDmCallAcceptViaSocket: socket.submitDmCallAccept,
    submitDmCallEndViaSocket: socket.submitDmCallEnd,
    isLiveReactionReady: socket.isLiveReactionReady,
    isLiveSocketReady: socket.isLiveSocketReady,
    uiTransactions: socket.uiTransactions,
    syncOutboundPresence: socket.syncOutboundPresence,
    ...post,
    wireDmCallSocketSubmitters: args.wireDmCallSocketSubmitters,
  };
}

/**
 * Pins → realtime host (E2EE) → socket bind → toast / presence / pin toggle /
 * DM call submitters / reactions. Call once after chat messages + NSFW gate.
 */
export function useAppLayoutRealtimeSession(
  deps: UseAppLayoutRealtimeSessionDeps,
) {
  const ingest = createRealtimeSessionIngest({
    mergeEchoDmThreadFromRealtime: deps.mergeEchoDmThreadFromRealtime,
    workspace: deps.workspace,
    echoSession: deps.echoSession,
    echoChannelHistory: deps.echoChannelHistory,
  });
  const pinsBag = wirePins(deps);
  const { pinsIntegration } = pinsBag;
  const { hostCallbacks } = wireHost(deps, ingest, pinsIntegration);
  const socket = wireSocket(
    deps,
    hostCallbacks,
    ingest.ensureReplyTargetMessage,
  );

  // Marker substring `wireDmCallSocketSubmitters({` (wiring-order contract).
  deps.wireDmCallSocketSubmitters({
    submitDmCallInvite: socket.submitDmCallInvite,
    submitDmCallAccept: socket.submitDmCallAccept,
    submitDmCallEnd: socket.submitDmCallEnd,
  });

  const post = wireRealtimeSessionPostSocket({
    authSession: deps.authSession,
    sendMessageViaSocket: socket.sendMessage,
    isLiveSocketReady: socket.isLiveSocketReady,
    syncOutboundPresence: socket.syncOutboundPresence,
    pinChannelId: pinsIntegration.pinChannelId,
    getPinnedIdsSnapshot: pinsIntegration.getPinnedIdsSnapshot,
    isLiveReactionReady: socket.isLiveReactionReady,
    uiTransactions: socket.uiTransactions,
    pinMessage: pinsIntegration.pinMessage,
    unpinMessage: pinsIntegration.unpinMessage,
    submitPinViaSocket: socket.submitPin,
    submitUnpinViaSocket: socket.submitUnpin,
    submitReactionToggleViaSocket: socket.submitReactionToggle,
    messages: deps.workspace.messages,
  });

  return buildSessionReturn({
    ingest,
    pinsBag,
    hostCallbacks,
    socket,
    post,
    wireDmCallSocketSubmitters: deps.wireDmCallSocketSubmitters,
  });
}
