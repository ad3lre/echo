import type { Ref } from 'vue';
import { fetchEchoServerMembers } from '@/api/echo/serverLifecycle';
import type { EchoSessionStore } from '@/stores/echoSession';
import type { useAuthSessionStore } from '@/stores/authSession';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { dbgMemberList } from '@/utils/echoMemberListDebug';

export type EchoServerMemberOrchestrationDeps = {
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoSession: EchoSessionStore;
  selectedServerId: Ref<string | null>;
};

export function createEchoServerMemberOrchestration(
  deps: EchoServerMemberOrchestrationDeps,
) {
  const { authSession, echoSession, selectedServerId } = deps;
  const inFlight = new Set<string>();

  async function fetchMembersForServer(serverId: string) {
    if (!serverId || serverId === 'echo') return;
    if (inFlight.has(serverId)) return;

    const token = authSession.accessToken?.trim() ?? '';
    if (!token) {
      dbgMemberList('fetchMembersForServer SKIP (no token)', { serverId });
      return;
    }

    inFlight.add(serverId);
    try {
      dbgMemberList('fetchMembersForServer START', { serverId });
      const { members } = await fetchEchoServerMembers(token, serverId);
      dbgMemberList('fetchMembersForServer OK', {
        serverId,
        count: Array.isArray(members) ? members.length : -1,
        sample: Array.isArray(members)
          ? members.slice(0, 3).map((m) => ({
              userId: (m as any)?.userId,
              isDiscordShadow: (m as any)?.isDiscordShadow,
              isGuest: (m as any)?.isGuest,
            }))
          : [],
      });
      echoSession.mergeMembersByServer({ [serverId]: members });
      dbgMemberList('fetchMembersForServer MERGED', { serverId });
    } catch (err) {
      reportPrimaryFlowFailure('fetchMembersForServer', err, { serverId });
      const msg = err instanceof Error ? err.message : String(err);
      dbgMemberList('fetchMembersForServer ERROR', { serverId, msg });
    } finally {
      inFlight.delete(serverId);
    }
  }

  return {
    fetchMembersForServer,
  };
}
