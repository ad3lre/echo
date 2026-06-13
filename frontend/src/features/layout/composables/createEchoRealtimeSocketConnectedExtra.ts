export function createEchoRealtimeSocketConnectedExtra(deps: {
  syncEchoPresenceFromApi: () => void;
  hydrateAttentionSnapshot: () => void | Promise<unknown>;
  /** Best-effort merge of messages missed while the socket was down or before joinChannel. */
  scheduleActiveChannelTailSyncAfterConnect?: (reason: string) => void;
}) {
  return (ctx?: { recovered?: boolean }) => {
    if (ctx?.recovered) {
      // Connection-state recovery replayed every packet missed while disconnected
      // (rooms, messages, attention/read-state updates), so the REST resync below
      // would be redundant load — notably the herd of presence + attention +
      // history fetches when a brief network blip reconnects many clients at once.
      return;
    }
    deps.syncEchoPresenceFromApi();
    void deps.hydrateAttentionSnapshot();
    deps.scheduleActiveChannelTailSyncAfterConnect?.('socket_connected');
  };
}
