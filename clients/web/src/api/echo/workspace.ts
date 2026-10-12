import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { fetchEchoServers } from './serverLifecycle';
import { echoFetch } from './transport';
import {
  workspaceHttpJsonToEchoWorkspaceState,
  type EchoWorkspaceMemberFetchDebugPayload,
  type EchoWorkspaceState,
  type WorkspaceHttpJsonValidated,
} from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';

export type {
  EchoWorkspaceState,
  EchoWorkspaceRawServer,
  EchoWorkspaceMemberFetchDebugPayload,
  EchoWorkspaceEventSummary,
  EchoWorkspaceMyEventRsvp,
} from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';

export {
  normalizeWorkspaceMembersByServer,
  deriveTimeoutUntilByServerUser,
  mergeEchoWorkspaceMembersIntoUsers,
  normalizeEchoWorkspaceServerRow,
  deriveServerMemberIds,
  buildEchoWorkspaceState,
  buildWorkspaceMemberFetchDebugPayload,
} from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';

export type EchoWorkspaceMemberDetailQuery = 'full' | 'roster' | 'none';

export type FetchEchoWorkspaceStateOptions = {
  /**
   * `none` — servers + channel trees only (fast first paint; roster follows).
   * `roster` — members without banner/bio (default for full hydrate).
   * `full` — members with profile chrome fields.
   */
  memberDetail?: EchoWorkspaceMemberDetailQuery;
  /** Optional hook for member-roster diagnostics — keep `dbgMemberList` in callers/orchestrators, not in this module. */
  onWorkspaceMemberFetchDebug?: (
    payload: EchoWorkspaceMemberFetchDebugPayload,
  ) => void;
};

export async function fetchEchoWorkspaceState(
  token: string,
  currentUserId: string | undefined,
  options?: FetchEchoWorkspaceStateOptions,
): Promise<EchoWorkspaceState> {
  const memberDetail: EchoWorkspaceMemberDetailQuery =
    options?.memberDetail ?? 'roster';
  const raw = await echoFetch<{
    servers: Awaited<ReturnType<typeof fetchEchoServers>>['servers'];
    categoriesByServer: Record<string, ChannelCategory[]>;
    membersByServer?: unknown;
    /** Some gateways / serializers use snake_case */
    members_by_server?: unknown;
    workspaceVersion?: unknown;
    upcomingEventsByServerId?: unknown;
    upcoming_events_by_server_id?: unknown;
    myEventRsvps?: unknown;
    my_event_rsvps?: unknown;
  }>(token, `/workspace?memberDetail=${memberDetail}`);
  if (
    !Array.isArray(raw.servers) ||
    raw.categoriesByServer == null ||
    typeof raw.categoriesByServer !== 'object'
  ) {
    throw new Error('Invalid workspace response');
  }
  for (const s of raw.servers) {
    const cats = raw.categoriesByServer[s.id];
    if (!Array.isArray(cats)) {
      throw new Error('Invalid workspace categories');
    }
  }
  return workspaceHttpJsonToEchoWorkspaceState(
    raw as WorkspaceHttpJsonValidated,
    currentUserId,
    {
      onWorkspaceMemberFetchDebug: options?.onWorkspaceMemberFetchDebug,
    },
  );
}
