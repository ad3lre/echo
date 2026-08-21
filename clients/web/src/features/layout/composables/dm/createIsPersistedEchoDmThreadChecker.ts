export function createIsPersistedEchoDmThreadChecker(deps: {
  getEchoDmThreadIds: () => ReadonlySet<string>;
}) {
  return (cid: string) => deps.getEchoDmThreadIds().has(cid);
}
