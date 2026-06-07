import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { AuthUserPublic } from '@/api/authClient';
import { echoUserRowFromAuthUser } from '@/composables/workspace/utils';
import type { applyWorkspaceRosterUsersPipeline } from '@/services/domain/workspaceRoster';

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
