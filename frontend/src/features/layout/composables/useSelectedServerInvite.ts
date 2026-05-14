import { computed, ref, watch, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import { PUBLIC_INVITE_BASE } from '@/config';
import {
  appendVoiceToEchoInviteShareUrl,
  echoInviteSharePageUrl,
} from '@/utils/echoInviteShareUrl';

function resolveInviteUrlFromApi(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (t.startsWith('/api/v1/echo/invites/')) {
    const m = t.match(/^\/api\/v1\/echo\/invites\/([^/]+)\/share\/?$/i);
    if (m?.[1]) return echoInviteSharePageUrl(decodeURIComponent(m[1]));
  }
  if (t.startsWith('/')) {
    const seg = t.replace(/^\/+/, '').split('/')[0]?.trim();
    if (seg) return echoInviteSharePageUrl(seg);
    return '';
  }
  return t;
}

/** POST /invites returns this when the guild has no vanity; modal already explains vanity setup. */
function shouldSuppressInviteLinkToast(error: unknown): boolean {
  return (
    error instanceof EchoApiError &&
    error.status === 400 &&
    error.body.code === 'VANITY_REQUIRED'
  );
}

function pickInviteLinkToastError(errors: unknown[]): unknown | undefined {
  const picked = errors.find(
    (e) => e != null && !shouldSuppressInviteLinkToast(e),
  );
  return picked ?? errors.find((e) => e != null);
}

function formatInviteLinkLoadError(error: unknown): string {
  if (error instanceof EchoApiError) {
    const m = error.message.trim();
    if (m) return m;
  }
  return 'Could not load invite link. Try again.';
}
import {
  fetchEchoServerInviteLink,
  postEchoServerInvite,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { iconEchoRounded } from '@/assets/branding';
import type { Server } from '@shared/types/server';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { useAuthSessionStore } from '@/stores/authSession';

export function useSelectedServerInvite(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  isInviteModalOpen: Ref<boolean>;
  /** When set while the invite modal is open, invite links include `?voice=` for VC deep links. */
  inviteVoiceChannelId: Ref<string | null>;
}) {
  const {
    serverStore,
    workspace,
    authSession,
    isInviteModalOpen,
    inviteVoiceChannelId,
  } = deps;

  const selectedServer = computed((): Server | undefined => {
    if (serverStore.selectedServerId === 'echo') {
      return {
        id: 'echo',
        name: 'Direct Messages',
        imageUrl: iconEchoRounded,
      };
    }
    const id = serverStore.selectedServerId;
    if (!id) return undefined;
    const fromStore = serverStore.servers.find((s) => s.id === id);
    const fromWs = (workspace.servers.value as Server[]).find(
      (s) => s.id === id,
    );
    if (!fromStore && !fromWs) return undefined;
    if (!fromWs) return fromStore;
    if (!fromStore) return fromWs;
    const merged: Server = { ...fromWs, ...fromStore };
    const vc =
      (fromStore.vanityCode ?? '').trim() || (fromWs.vanityCode ?? '').trim();
    if (vc) merged.vanityCode = vc;
    else delete merged.vanityCode;
    return merged;
  });

  const inviteLinkFromSelectedServer = computed(() => {
    const s = selectedServer.value;
    if (!s || s.id === 'echo') return `${PUBLIC_INVITE_BASE}/echo`;
    const v = (s.vanityCode ?? '').trim();
    if (v) return echoInviteSharePageUrl(v);
    return '';
  });

  const inviteLinkFromApi = ref('');
  /** True while resolving vanity from API when workspace snapshot had no `vanityCode` yet. */
  const inviteLinkLookupPending = ref(false);

  function syncVanityAcrossServerLists(serverId: string, vanityCode: string) {
    const v = vanityCode.trim();
    if (!v) return;
    const next = serverStore.servers.map((s) =>
      s.id === serverId ? { ...s, vanityCode: v } : s,
    );
    serverStore.setServers(next);
    workspace.servers.value = next;
  }

  watch(
    () =>
      [
        isInviteModalOpen.value,
        serverStore.selectedServerId,
        inviteLinkFromSelectedServer.value,
      ] as const,
    async ([open, sid, linkFromState]) => {
      if (!open) {
        inviteLinkFromApi.value = '';
        inviteLinkLookupPending.value = false;
        return;
      }
      if (linkFromState.trim()) {
        inviteLinkFromApi.value = '';
        inviteLinkLookupPending.value = false;
        return;
      }
      if (!sid || sid === 'echo') {
        inviteLinkLookupPending.value = false;
        return;
      }
      const serverId = sid;
      /** Cookie sessions omit `accessToken`; invite fetch uses `credentials: 'include'`. */
      const token = authSession.accessToken?.trim() ?? '';
      if (!authSession.isAuthenticated) {
        inviteLinkLookupPending.value = false;
        return;
      }
      inviteLinkLookupPending.value = true;
      inviteLinkFromApi.value = '';

      const errors: unknown[] = [];

      function applyInvitePayload(r: {
        vanityCode?: string;
        inviteUrl?: string;
      }): boolean {
        const vc = typeof r.vanityCode === 'string' ? r.vanityCode.trim() : '';
        if (vc) {
          inviteLinkFromApi.value = echoInviteSharePageUrl(vc);
          syncVanityAcrossServerLists(serverId, vc);
          return true;
        }
        const inviteUrl =
          typeof r.inviteUrl === 'string' ? r.inviteUrl.trim() : '';
        if (inviteUrl) {
          inviteLinkFromApi.value = resolveInviteUrlFromApi(inviteUrl);
          return true;
        }
        return false;
      }

      try {
        const r = await fetchEchoServerInviteLink(token, serverId);
        if (applyInvitePayload(r)) return;
        try {
          const created = await postEchoServerInvite(token, serverId);
          if (applyInvitePayload(created)) return;
        } catch (e) {
          errors.push(e);
        }
      } catch (e) {
        errors.push(e);
        try {
          const created = await postEchoServerInvite(token, serverId);
          if (applyInvitePayload(created)) return;
        } catch (e2) {
          errors.push(e2);
        }
      } finally {
        inviteLinkLookupPending.value = false;
      }

      if (!inviteLinkFromApi.value.trim()) {
        const toastErr = pickInviteLinkToastError(errors);
        if (toastErr != null && !shouldSuppressInviteLinkToast(toastErr)) {
          dispatchAppToast(formatInviteLinkLoadError(toastErr), 'warning');
        }
      }
    },
  );

  const inviteLinkForServer = computed(() =>
    appendVoiceToEchoInviteShareUrl(
      inviteLinkFromSelectedServer.value.trim() ||
        inviteLinkFromApi.value.trim(),
      inviteVoiceChannelId.value,
    ),
  );

  const newlyCreatedServerId = ref<string | null>(null);

  watch(
    () => serverStore.selectedServerId,
    (sid) => {
      if (!sid) return;
      if (newlyCreatedServerId.value && sid !== newlyCreatedServerId.value) {
        newlyCreatedServerId.value = null;
      }
    },
  );

  return {
    selectedServer,
    inviteLinkFromSelectedServer,
    inviteLinkFromApi,
    inviteLinkLookupPending,
    inviteLinkForServer,
    syncVanityAcrossServerLists,
    newlyCreatedServerId,
  };
}
