export function createEchoRealtimeSocketConnectedExtra(deps: {
  syncEchoPresenceFromApi: () => void;
  hydrateAttentionSnapshot: () => void | Promise<unknown>;
}) {
  return () => {
    deps.syncEchoPresenceFromApi();
    void deps.hydrateAttentionSnapshot();
  };
}
