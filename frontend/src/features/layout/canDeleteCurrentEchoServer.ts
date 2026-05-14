import type { Server } from '@shared/types';
import { isEchoGraphId } from '@/utils/echoIds';
import { isEchoServerOwner } from '@/utils/echoServerOwnership';

/** Server rail “delete server” is only for Echo graph guilds where the current user is owner. */
export function canDeleteCurrentEchoServer(opts: {
  selectedServer: Server | undefined;
  currentUserId: string | undefined;
}): boolean {
  const s = opts.selectedServer;
  const uid = opts.currentUserId;
  return (
    !!s?.id &&
    s.id !== 'echo' &&
    isEchoGraphId(s.id) &&
    isEchoServerOwner(s, uid)
  );
}
