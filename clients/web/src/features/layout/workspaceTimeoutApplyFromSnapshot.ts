import type { Ref } from 'vue';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { deriveTimeoutUntilByServerUser } from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';
import { dbgMemberList } from '@/features/layout/composables/members/echoMemberListDebug';

export type WorkspaceTimeoutApplyTrackRefs = {
  lastTimeoutWorkspaceVersion: Ref<string>;
  lastTimeoutServerCount: Ref<number>;
  lastTimeoutMemberKeyCount: Ref<number>;
};

/**
 * Applies `timeoutUntilByServerUser` from a workspace snapshot with the same
 * version + shape fingerprint NOOP policy as `applyWorkspaceStateToRefs`.
 */
export function applyTimeoutUntilFromWorkspaceSnapshot(
  state: EchoWorkspaceState,
  timeoutUntilByServerUser: Ref<Record<string, Record<string, number>>>,
  track: WorkspaceTimeoutApplyTrackRefs,
): void {
  const v =
    typeof state.workspaceVersion === 'string' && state.workspaceVersion.trim()
      ? state.workspaceVersion.trim()
      : '0';
  const serverCount = Array.isArray(state.servers) ? state.servers.length : 0;
  const memberKeyCount =
    state.membersByServer && typeof state.membersByServer === 'object'
      ? Object.keys(state.membersByServer).length
      : 0;
  if (state.membersByServer == null) {
    timeoutUntilByServerUser.value = {};
    track.lastTimeoutWorkspaceVersion.value = v;
    track.lastTimeoutServerCount.value = serverCount;
    track.lastTimeoutMemberKeyCount.value = memberKeyCount;
    return;
  }
  if (track.lastTimeoutWorkspaceVersion.value === v) {
    if (
      track.lastTimeoutServerCount.value === serverCount &&
      track.lastTimeoutMemberKeyCount.value === memberKeyCount
    ) {
      dbgMemberList(
        'applyTimeoutUntilFromWorkspaceSnapshot NOOP (duplicate version)',
        { workspaceVersion: v },
      );
      return;
    }
    dbgMemberList(
      'applyTimeoutUntilFromWorkspaceSnapshot WARN (same version, shape differs)',
      {
        workspaceVersion: v,
        incomingServerCount: serverCount,
        storedServerCount: track.lastTimeoutServerCount.value,
        incomingMemberKeyCount: memberKeyCount,
        storedMemberKeyCount: track.lastTimeoutMemberKeyCount.value,
      },
    );
  }
  timeoutUntilByServerUser.value = deriveTimeoutUntilByServerUser(
    state.membersByServer,
  );
  track.lastTimeoutWorkspaceVersion.value = v;
  track.lastTimeoutServerCount.value = serverCount;
  track.lastTimeoutMemberKeyCount.value = memberKeyCount;
}
