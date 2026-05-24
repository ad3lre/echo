export function createEchoRealtimeSocketConnectedExtra(deps: {
  syncEchoPresenceFromApi: () => void;
  hydrateAttentionSnapshot: () => void | Promise<unknown>;
  /** Best-effort merge of messages missed while the socket was down or before joinChannel. */
  scheduleActiveChannelTailSyncAfterConnect?: (reason: string) => void;
}) {
  return () => {
    deps.syncEchoPresenceFromApi();
    void deps.hydrateAttentionSnapshot();
    deps.scheduleActiveChannelTailSyncAfterConnect?.('socket_connected');
  };
}
