export function createOpenCreateChannelOnServer(deps: {
  openServerSurface: (serverId: string) => void;
  openCreateChannelModal: (categoryId: string | null) => void;
}) {
  return (serverId: string) => {
    deps.openServerSurface(serverId);
    deps.openCreateChannelModal(null);
  };
}
