import type { Ref } from 'vue';
import { fetchEchoServerMembers } from '@/api/echo/serverLifecycle';
import type { EchoSessionStore } from '@/features/layout/echoSession';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { dbgMemberList } from '@/features/layout/composables/members/echoMemberListDebug';

export type EchoServerMemberOrchestrationDeps = {
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoSession: EchoSessionStore;
  selectedServerId: Ref<string | null>;
};

/** Skip redundant `/members` while a fresh workspace roster is already in memory. */
const MEMBER_ROSTER_FRESH_TTL_MS = 60_000;

export function createEchoServerMemberOrchestration(
  deps: EchoServerMemberOrchestrationDeps,
) {
  const { authSession, echoSession, selectedServerId } = deps;
  const inFlight = new Set<string>();
  const lastOkAtByServer = new Map<string, number>();

  async function fetchMembersForServer(serverId: string) {
    if (!serverId || serverId === 'echo') return;
    if (inFlight.has(serverId)) return;

    // Cookie-session BFF: `echoFetch` ignores the token string. Do not gate on
    // `accessToken` (often null after setSession) or per-server member rescue
    // never runs and Settings → Members stays empty until deferred roster/reload.
    if (!authSession.isAuthenticated) {
      dbgMemberList('fetchMembersForServer SKIP (not authenticated)', {
        serverId,
      });
      return;
    }

    const ids = echoSession.serverMemberIds[serverId];
    const roster = echoSession.workspaceMembersByServer[serverId];
    const knownCount = Math.max(
      Array.isArray(ids) ? ids.length : 0,
      Array.isArray(roster) ? roster.length : 0,
    );
    if (knownCount > 0) {
      const lastOk = lastOkAtByServer.get(serverId);
      if (lastOk == null) {
        // Workspace hydrate already filled the roster — skip the duplicate GET.
        lastOkAtByServer.set(serverId, Date.now());
        dbgMemberList('fetchMembersForServer SKIP (roster already present)', {
          serverId,
          knownCount,
        });
        return;
      }
      if (Date.now() - lastOk < MEMBER_ROSTER_FRESH_TTL_MS) {
        dbgMemberList('fetchMembersForServer SKIP (fresh roster)', {
          serverId,
          knownCount,
          ageMs: Date.now() - lastOk,
        });
        return;
      }
    }

    const token = authSession.accessToken?.trim() || '__session__';

    inFlight.add(serverId);
    try {
      dbgMemberList('fetchMembersForServer START', { serverId });
      const { members } = await fetchEchoServerMembers(token, serverId);
      dbgMemberList('fetchMembersForServer OK', {
        serverId,
        count: Array.isArray(members) ? members.length : -1,
        sample: Array.isArray(members)
          ? members.slice(0, 3).map((m) => ({
              userId: m.userId,
              isDiscordShadow: m.isDiscordShadow,
              isGuest: m.isGuest,
            }))
          : [],
      });
      echoSession.mergeMembersByServer({ [serverId]: members });
      lastOkAtByServer.set(serverId, Date.now());
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
