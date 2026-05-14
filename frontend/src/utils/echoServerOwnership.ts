import type { Server } from '@shared/types';

/** Virtual home surface — never show “Leave server” for this id. */
export const ECHO_HOME_SERVER_ID = 'echo';

/** True when the workspace lists this user as `echo_servers.owner_id`. */
export function isEchoServerOwner(
  server: Pick<Server, 'ownerId'>,
  userId: string | undefined | null,
): boolean {
  if (!userId || !server.ownerId) return false;
  return server.ownerId === userId;
}

/** Server owners cannot leave until ownership is transferred to another member. */
export function canMemberLeaveEchoServer(
  server: Pick<Server, 'ownerId'>,
  userId: string | undefined | null,
): boolean {
  return !isEchoServerOwner(server, userId);
}

/**
 * Whether the client should show a Leave server affordance (rail context menu,
 * server header menu). Developer Mode allows owners to open the confirm flow
 * for local/staging testing; production API may still reject the leave.
 */
export function shouldOfferLeaveServerInClientUi(
  server: Pick<Server, 'id' | 'ownerId'>,
  userId: string | undefined | null,
  devModeIdsEnabled: boolean,
): boolean {
  if (server.id === ECHO_HOME_SERVER_ID) return false;
  if (devModeIdsEnabled) return true;
  return canMemberLeaveEchoServer(server, userId);
}
