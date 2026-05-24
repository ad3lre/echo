import type { EchoServerMemberDto } from '@/api/echo/types';
import {
  applyWorkspaceRosterUsersPipeline,
  type WorkspaceRosterUserRow,
} from '@/services/domain/workspaceRoster';

/** Synthetic server bucket for DM/group peer rows merged outside workspace snapshots. */
export const ECHO_PEER_HYDRATE_SERVER_KEY = '__echoPeerHydrate';

export function mergeEchoResolvedPeersIntoWorkspaceUsers(
  users: readonly WorkspaceRosterUserRow[],
  resolved: readonly {
    id: string;
    name: string;
    pfp: string;
    username?: string;
    badges?: string[];
  }[],
): WorkspaceRosterUserRow[] {
  if (!resolved.length) return [...users];
  const members: EchoServerMemberDto[] = resolved.map((r) => ({
    userId: r.id,
    name: r.name,
    accountDisplayName: r.name,
    pfp: r.pfp ?? '',
    ...(r.username ? { username: r.username } : {}),
    ...(Array.isArray(r.badges) && r.badges.length ? { badges: r.badges } : {}),
  }));
  return applyWorkspaceRosterUsersPipeline(users, {
    membersByServer: { [ECHO_PEER_HYDRATE_SERVER_KEY]: members },
  });
}
