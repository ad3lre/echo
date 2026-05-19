import type { Ref } from 'vue';
import type { EchoWorkspaceEvent } from '@shared/types';
import type { useEchoSessionStore } from '@/stores/echoSession';
import { createWorkspaceSocketEventHandler } from '@/services/orchestration/workspaceSocketEventHandler';
import { createBumpLiveChannelCapabilitiesKey } from './createBumpLiveChannelCapabilitiesKey';
import { createEchoRealtimeSocketConnectedExtra } from './createEchoRealtimeSocketConnectedExtra';
import { createAppLayoutRealtimeSocketHostCallbacks } from './createAppLayoutRealtimeSocketHostCallbacks';
import type { AppLayoutEchoRealtimeHostCallbacks } from './useAppLayoutRealtimeSocketBinding';

type EchoHistoryHydrate = {
  hydrateAttentionSnapshot: () => void | Promise<void>;
  applyEchoChannelClientCap: (channelId: string) => void;
};

/**
 * Builds workspace socket handler + post-connect extra + host callback bag for
 * `useAppLayoutRealtimeSocketBinding`, so `useAppLayoutController` only passes deps.
 */
export function useAppLayoutRealtimeHostWiring(deps: {
  echoSession: ReturnType<typeof useEchoSessionStore>;
  liveChannelCapabilitiesRefreshKey: Ref<number>;
  hydrateEchoFromApi: () => void | Promise<unknown>;
  refreshEchoSocialFromApi: () => void | Promise<unknown>;
  /** Refreshes cached E2EE thread state for the active DM after `workspace_invalidated`. */
  refreshActiveDmE2eeThreadState?: () => void | Promise<unknown>;
  syncEchoPresenceFromApi: () => void | Promise<unknown>;
  echoChannelHistory: EchoHistoryHydrate;
  applyEchoPresenceFromSocket: AppLayoutEchoRealtimeHostCallbacks['onPresenceUpdate'];
  handleEchoDmActivity: AppLayoutEchoRealtimeHostCallbacks['onDmActivity'];
  handleEchoDmCall: AppLayoutEchoRealtimeHostCallbacks['onDmCall'];
  handleEchoDmThreadActivity: AppLayoutEchoRealtimeHostCallbacks['onDmThreadActivity'];
  mergeReadStateUpdate: AppLayoutEchoRealtimeHostCallbacks['mergeReadStateUpdate'];
  replaceAttentionSnapshot: AppLayoutEchoRealtimeHostCallbacks['replaceAttentionSnapshot'];
  setChannelPinsFromEcho: AppLayoutEchoRealtimeHostCallbacks['setChannelPinsFromEcho'];
  restorePinnedIds: (channelId: string, ids: string[]) => void;
  applyRealtimeAuthorHint: AppLayoutEchoRealtimeHostCallbacks['applyRealtimeAuthorHint'];
  onVoiceE2eeEpochSuperseded?: (payload: EchoWorkspaceEvent) => void;
}): { hostCallbacks: AppLayoutEchoRealtimeHostCallbacks } {
  const bumpLiveChannelCapabilities = createBumpLiveChannelCapabilitiesKey(
    deps.liveChannelCapabilitiesRefreshKey,
  );

  const handleWorkspaceEvent = createWorkspaceSocketEventHandler({
    noteWorkspaceEventVersion: (version) =>
      deps.echoSession.noteWorkspaceEventVersion(version),
    bumpLiveChannelCapabilities,
    hydrateEchoFromApi: async () => {
      await deps.hydrateEchoFromApi();
    },
    refreshEchoSocialFromApi: async () => {
      await deps.refreshEchoSocialFromApi();
    },
    onWorkspaceInvalidated: deps.refreshActiveDmE2eeThreadState
      ? () => void deps.refreshActiveDmE2eeThreadState?.()
      : undefined,
    onDiscordVoiceMirrorRoster: (payload) => {
      if (payload.discordVoiceMirror) {
        deps.echoSession.mergeDiscordVoiceMirrorFromSocket(
          payload.discordVoiceMirror,
        );
      }
    },
    onVoiceRosterDelta: (payload) => {
      deps.echoSession.applyVoiceRosterDelta(payload);
    },
    onVoiceE2eeEpochSuperseded: deps.onVoiceE2eeEpochSuperseded,
  });

  const onSocketConnectedExtra = createEchoRealtimeSocketConnectedExtra({
    syncEchoPresenceFromApi: deps.syncEchoPresenceFromApi,
    hydrateAttentionSnapshot: () =>
      void deps.echoChannelHistory.hydrateAttentionSnapshot(),
  });

  const hostCallbacks = createAppLayoutRealtimeSocketHostCallbacks({
    applyEchoPresenceFromSocket: deps.applyEchoPresenceFromSocket,
    handleEchoDmActivity: deps.handleEchoDmActivity,
    handleEchoDmCall: deps.handleEchoDmCall,
    handleEchoDmThreadActivity: deps.handleEchoDmThreadActivity,
    mergeReadStateUpdate: deps.mergeReadStateUpdate,
    replaceAttentionSnapshot: deps.replaceAttentionSnapshot,
    handleWorkspaceEvent,
    onSocketConnectedExtra,
    setChannelPinsFromEcho: deps.setChannelPinsFromEcho,
    restorePinnedIds: deps.restorePinnedIds,
    applyEchoChannelClientCap: (channelId) =>
      deps.echoChannelHistory.applyEchoChannelClientCap(channelId),
    applyRealtimeAuthorHint: deps.applyRealtimeAuthorHint,
  });

  return { hostCallbacks };
}
