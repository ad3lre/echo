import { computed, watch, type ComputedRef, type Ref } from 'vue';
import { fetchEchoUserPublicProfile } from '@/api/echo/social';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { mergeEchoResolvedPeersIntoWorkspaceUsers } from '@/features/dm/mergeEchoResolvedPeersIntoWorkspace';
import type { WorkspaceRosterUserRow } from '@/services/domain/workspaceRoster';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

const inflight = new Map<string, Promise<void>>();

/**
 * Fetches minimal public profile rows for DM/group peers missing from `workspace.users`
 * (deduped, on-demand when DM UI is relevant).
 */
export function useEchoDmPeerProfileHydration(deps: {
  enabled: ComputedRef<boolean>;
  getToken: () => string;
  workspaceUsers: Ref<WorkspaceRosterUserRow[]>;
  selfId: Ref<string | undefined>;
  echoPeerByChannelId: Ref<Map<string, string>>;
  groupDMs: Ref<Record<string, { memberIds: string[] }>>;
  selectedDMUserId: Ref<string | null>;
  activeGroupSettingsId: Ref<string | null | undefined>;
}): void {
  const missingIds = computed(() => {
    const self = deps.selfId.value?.trim() ?? '';
    const known = new Set(deps.workspaceUsers.value.map((u) => u.id));
    const out = new Set<string>();
    for (const p of deps.echoPeerByChannelId.value.values()) {
      const id = p?.trim();
      if (id && id !== self && !known.has(id)) out.add(id);
    }
    for (const g of Object.values(deps.groupDMs.value)) {
      for (const mid of g.memberIds ?? []) {
        const id = typeof mid === 'string' ? mid.trim() : '';
        if (id && id !== self && !known.has(id)) out.add(id);
      }
    }
    const sel = deps.selectedDMUserId.value?.trim();
    if (sel && sel !== self && !known.has(sel)) out.add(sel);
    const gs = deps.activeGroupSettingsId.value?.trim();
    if (gs) {
      const g = deps.groupDMs.value[gs];
      if (g?.memberIds) {
        for (const mid of g.memberIds) {
          const id = typeof mid === 'string' ? mid.trim() : '';
          if (id && id !== self && !known.has(id)) out.add(id);
        }
      }
    }
    return [...out];
  });

  const tokenSig = computed(() => deps.getToken().trim());

  function scheduleHydration(ids: readonly string[]) {
    if (echoSyncCapabilities.isMockDataMode) return;
    const token = tokenSig.value;
    if (!token) return;

    for (const rawId of ids) {
      const id = rawId.trim();
      if (!id) continue;
      if (inflight.has(id)) continue;

      const job = (async () => {
        try {
          const profile = await fetchEchoUserPublicProfile(token, id);
          deps.workspaceUsers.value = mergeEchoResolvedPeersIntoWorkspaceUsers(
            deps.workspaceUsers.value,
            [profile],
          );
        } catch (e) {
          reportPrimaryFlowFailure('fetchEchoUserPublicProfile', e, {
            peerUserId: id,
          });
        } finally {
          inflight.delete(id);
        }
      })();

      inflight.set(id, job);
    }
  }

  watch(
    () =>
      [
        deps.enabled.value,
        tokenSig.value,
        missingIds.value.slice().sort().join(','),
      ] as const,
    () => {
      if (!deps.enabled.value || !tokenSig.value) return;
      scheduleHydration(missingIds.value);
    },
    { flush: 'post', immediate: true },
  );
}
