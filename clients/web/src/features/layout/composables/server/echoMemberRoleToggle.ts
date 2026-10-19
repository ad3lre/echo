import type { Ref } from 'vue';
import {
  postEchoAssignMemberRole,
  deleteEchoMemberRoleAssignment,
} from '@/api/echoClient';

type AuthSessionLike = {
  isAuthenticated: boolean;
  accessToken?: string | null;
};

/**
 * Optimistic member-role assign/remove: update local assignment ids before the
 * network round-trip; roll back only the failed role on error.
 */
export function createEchoMemberRoleToggleHandler(input: {
  authSession: AuthSessionLike;
  serverId: string;
  echoMemberRoleIdsByUser: Ref<Record<string, string[]>>;
  echoRoleMutationBusy: Ref<boolean>;
  getInFlight: () => number;
  setInFlight: (n: number) => void;
  refreshEchoRoleData: () => Promise<void>;
}): (p: {
  targetUserId: string;
  roleId: string;
  assign: boolean;
}) => Promise<void> {
  return async (p) => {
    const token = input.authSession.accessToken?.trim() ?? '';
    if (!input.authSession.isAuthenticated) return;
    const prev = input.echoMemberRoleIdsByUser.value[p.targetUserId] ?? [];
    const set = new Set(prev);
    if (p.assign) set.add(p.roleId);
    else set.delete(p.roleId);
    input.echoMemberRoleIdsByUser.value = {
      ...input.echoMemberRoleIdsByUser.value,
      [p.targetUserId]: Array.from(set),
    };
    input.setInFlight(input.getInFlight() + 1);
    input.echoRoleMutationBusy.value = true;
    try {
      if (p.assign)
        await postEchoAssignMemberRole(
          token,
          input.serverId,
          p.targetUserId,
          p.roleId,
        );
      else
        await deleteEchoMemberRoleAssignment(
          token,
          input.serverId,
          p.targetUserId,
          p.roleId,
        );
    } catch {
      const current = input.echoMemberRoleIdsByUser.value[p.targetUserId] ?? [];
      const rolled = new Set(current);
      if (p.assign) rolled.delete(p.roleId);
      else rolled.add(p.roleId);
      input.echoMemberRoleIdsByUser.value = {
        ...input.echoMemberRoleIdsByUser.value,
        [p.targetUserId]: Array.from(rolled),
      };
      await input.refreshEchoRoleData();
    } finally {
      input.setInFlight(Math.max(0, input.getInFlight() - 1));
      input.echoRoleMutationBusy.value = input.getInFlight() > 0;
    }
  };
}
