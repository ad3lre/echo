import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { AuthUserPublic } from '@/api/authClient';
import { echoUserRowFromAuthUser } from '@/features/layout/echoWorkspace/utils';
import type { applyWorkspaceRosterUsersPipeline } from '@/features/layout/echoWorkspace/workspaceRoster';

export function applyWorkspaceFallbackOnHydrationError(opts: {
  workspace: Pick<
    WorkspaceStateApi,
    | 'servers'
    | 'categoriesByServer'
    | 'serverMemberIds'
    | 'timeoutUntilByServerUser'
    | 'users'
    | 'fromApi'
    | 'apiError'
  >;
  echoSession: { resetSessionState: () => void };
  authUser: AuthUserPublic;
  error: unknown;
  applyRosterPipeline: typeof applyWorkspaceRosterUsersPipeline;
}) {
  const { workspace, echoSession, authUser, error, applyRosterPipeline } = opts;
  echoSession.resetSessionState();
  workspace.servers.value = [];
  workspace.categoriesByServer.value = {};
  workspace.serverMemberIds.value = {};
  workspace.timeoutUntilByServerUser.value = {};
  workspace.users.value = applyRosterPipeline(
    [echoUserRowFromAuthUser(authUser)],
    {},
  );
  workspace.fromApi.value = false;
  workspace.apiError.value =
    error instanceof Error ? error.message : 'Echo workspace unavailable';
}
