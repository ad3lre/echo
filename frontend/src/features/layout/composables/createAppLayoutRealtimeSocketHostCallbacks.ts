import type { AppLayoutEchoRealtimeHostCallbacks } from './useAppLayoutRealtimeSocketBinding';

/** Binds layout-owned deps into the realtime host callback bag for `useAppLayoutRealtimeSocketBinding`. */
export function createAppLayoutRealtimeSocketHostCallbacks(deps: {
  applyEchoPresenceFromSocket: AppLayoutEchoRealtimeHostCallbacks['onPresenceUpdate'];
  handleEchoDmActivity: AppLayoutEchoRealtimeHostCallbacks['onDmActivity'];
  handleEchoDmCall: AppLayoutEchoRealtimeHostCallbacks['onDmCall'];
  handleEchoDmThreadActivity: AppLayoutEchoRealtimeHostCallbacks['onDmThreadActivity'];
  mergeReadStateUpdate: AppLayoutEchoRealtimeHostCallbacks['mergeReadStateUpdate'];
  replaceAttentionSnapshot: AppLayoutEchoRealtimeHostCallbacks['replaceAttentionSnapshot'];
  handleWorkspaceEvent: AppLayoutEchoRealtimeHostCallbacks['onEchoWorkspaceEvent'];
  onSocketConnectedExtra: () => void;
  setChannelPinsFromEcho: AppLayoutEchoRealtimeHostCallbacks['setChannelPinsFromEcho'];
  restorePinnedIds: (channelId: string, ids: string[]) => void;
  applyEchoChannelClientCap: AppLayoutEchoRealtimeHostCallbacks['applyEchoChannelClientCap'];
  applyRealtimeAuthorHint: AppLayoutEchoRealtimeHostCallbacks['applyRealtimeAuthorHint'];
}): AppLayoutEchoRealtimeHostCallbacks {
  return {
    onPresenceUpdate: deps.applyEchoPresenceFromSocket,
    onDmActivity: deps.handleEchoDmActivity,
    onDmCall: deps.handleEchoDmCall,
    onDmThreadActivity: deps.handleEchoDmThreadActivity,
    mergeReadStateUpdate: deps.mergeReadStateUpdate,
    replaceAttentionSnapshot: deps.replaceAttentionSnapshot,
    onEchoWorkspaceEvent: deps.handleWorkspaceEvent,
    onSocketConnected: () => {
      deps.onSocketConnectedExtra();
    },
    onSocketDisconnected: () => {},
    setChannelPinsFromEcho: deps.setChannelPinsFromEcho,
    pinRollbackSync: { restorePinnedIds: deps.restorePinnedIds },
    applyEchoChannelClientCap: deps.applyEchoChannelClientCap,
    onConnectError: () => {},
    onUnexpectedDisconnect: () => {},
    onMessageFailed: () => {},
    applyRealtimeAuthorHint: deps.applyRealtimeAuthorHint,
  };
}
