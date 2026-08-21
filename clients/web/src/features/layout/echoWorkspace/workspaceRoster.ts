import type { EchoServerMemberDto } from '@/api/echo/types';
import { applyWorkspaceMembersToRoster } from '@/features/layout/echoWorkspace/workspaceRosterMerge';
import {
  mergeAuthUserIntoWorkspaceRoster,
  type AuthBackendUserForRoster,
  type WorkspaceRosterUserRow,
} from '@/features/layout/echoWorkspace/workspaceAuthUserRoster';
import { mergeLocalProfilesIntoUsers } from '@/features/settings/localProfilePersistence';

/**
 * Single documented merge order for workspace roster rows.
 */
export function applyWorkspaceRosterUsersPipeline(
  users: readonly WorkspaceRosterUserRow[],
  opts: {
    membersByServer?: Record<string, EchoServerMemberDto[]>;
    authUser?: AuthBackendUserForRoster | null;
  },
): WorkspaceRosterUserRow[] {
  let next = [...users];
  if (opts.membersByServer) {
    next = applyWorkspaceMembersToRoster(next, opts.membersByServer).users;
  }
  if (opts.authUser !== undefined) {
    const withAuth = mergeAuthUserIntoWorkspaceRoster(next, opts.authUser);
    if (withAuth) next = withAuth;
  }
  return mergeLocalProfilesIntoUsers(next);
}

export function removeWorkspaceRosterUserById(
  users: readonly WorkspaceRosterUserRow[],
  userId: string,
): WorkspaceRosterUserRow[] {
  if (!userId) return [...users];
  return users.filter((user) => user.id !== userId);
}

export { type AuthBackendUserForRoster, type WorkspaceRosterUserRow };
