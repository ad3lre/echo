import type { WorkspaceStateRefs, MockData } from './types';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { MemberRole } from '@/features/member-profile/memberProfiles';
import {
  postEchoAssignMemberRole,
  deleteEchoMemberRoleAssignment,
  putEchoServerNotificationPreference,
} from '@/api/echoClient';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { useEchoAttentionStore } from '@/features/layout/echoAttention';

export function useWorkspaceUserActions(refs: WorkspaceStateRefs) {
  const { users, serverNotificationOverrides, serverMemberNicknames } = refs;
  const echoAttention = useEchoAttentionStore();

  function getServerNotificationLevel(
    serverId: string,
  ): ServerNotificationLevel {
    return serverNotificationOverrides.value[serverId] ?? 'mentions';
  }

  function setServerNotificationLevel(
    serverId: string,
    level: ServerNotificationLevel,
  ) {
    const auth = useAuthSessionStore();
    const next = { ...serverNotificationOverrides.value };
    if (level === 'mentions') delete next[serverId];
    else next[serverId] = level;
    serverNotificationOverrides.value = next;
    echoAttention.patchServerNotificationLevel(serverId, level);
    if (!auth.accessToken) return;
    void putEchoServerNotificationPreference(
      auth.accessToken,
      serverId,
      level,
    ).catch((e) => {
      reportPrimaryFlowFailure('putEchoServerNotificationPreference', e, {
        serverId,
        level,
      });
    });
  }

  function patchUserRowById(
    userId: string,
    patch: Partial<MockData['users'][number]>,
  ) {
    const list = users.value;
    const i = list.findIndex((u) => u.id === userId);
    if (i < 0) return;
    users.value = list.map((u, idx) => (idx === i ? { ...u, ...patch } : u));
  }

  function setServerMemberNickname(
    serverId: string,
    userId: string,
    nickname: string,
  ) {
    if (!serverId || !userId) return;
    const root = { ...serverMemberNicknames.value };
    const per = { ...(root[serverId] ?? {}) };
    const t = nickname.trim().slice(0, 32);
    if (!t) {
      delete per[userId];
    } else {
      per[userId] = t;
    }
    if (Object.keys(per).length === 0) delete root[serverId];
    else root[serverId] = per;
    serverMemberNicknames.value = root;
  }

  function toggleMemberRole(
    serverId: string,
    userId: string,
    role: MemberRole,
    assign: boolean,
  ) {
    const auth = useAuthSessionStore();
    if (!auth.accessToken) return;
    if (assign) {
      void postEchoAssignMemberRole(
        auth.accessToken,
        serverId,
        userId,
        role.id,
      ).catch((e) => {
        reportPrimaryFlowFailure('postEchoAssignMemberRole', e, {
          serverId,
          userId,
          roleId: role.id,
        });
      });
    } else {
      void deleteEchoMemberRoleAssignment(
        auth.accessToken,
        serverId,
        userId,
        role.id,
      ).catch((e) => {
        reportPrimaryFlowFailure('deleteEchoMemberRoleAssignment', e, {
          serverId,
          userId,
          roleId: role.id,
        });
      });
    }
  }

  return {
    getServerNotificationLevel,
    setServerNotificationLevel,
    patchUserRowById,
    setServerMemberNickname,
    toggleMemberRole,
  };
}
