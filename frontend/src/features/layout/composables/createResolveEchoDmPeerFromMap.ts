export function createResolveEchoDmPeerFromMap(
  getPeerMap: () => ReadonlyMap<string, string>,
) {
  return (channelId: string) => getPeerMap().get(channelId) ?? null;
}
