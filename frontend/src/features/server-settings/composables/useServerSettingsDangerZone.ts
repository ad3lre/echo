import { computed, ref, type Ref } from 'vue';
import {
  deleteEchoServer,
  postEchoTransferServerOwnership,
} from '@/api/echoClient';

export type UseServerSettingsDangerZoneOptions = {
  accessToken: Ref<string | null | undefined>;
  backendUserId: Ref<string | undefined>;
  server: Ref<{
    id: string;
    name: string;
    ownerId?: string;
  } | null>;
  users: Ref<{ id: string; name: string; pfp: string; status?: string }[]>;
  deleteServerEnabled: Ref<boolean>;
  onWorkspaceRefresh: () => void;
  onServerDeleted: (serverId: string) => void;
};

export function useServerSettingsDangerZone(
  opts: UseServerSettingsDangerZoneOptions,
) {
  const transferOwnershipLoading = ref(false);
  const transferOwnershipError = ref('');
  const deleteServerLoading = ref(false);
  const deleteServerError = ref('');

  const canTransferEchoOwnership = computed(() => {
    if (!opts.server.value?.id) return false;
    const uid = opts.backendUserId.value;
    const ownerId = opts.server.value.ownerId;
    if (!uid || !ownerId || ownerId !== uid) return false;
    return true;
  });

  const transferOwnershipCandidates = computed(() => {
    const uid = opts.backendUserId.value;
    if (!uid) return opts.users.value;
    return opts.users.value.filter((u) => u.id !== uid);
  });

  async function runTransferOwnership(newOwnerId: string) {
    transferOwnershipError.value = '';
    const token = opts.accessToken.value;
    const sid = opts.server.value?.id;
    if (!sid) return;
    transferOwnershipLoading.value = true;
    try {
      await postEchoTransferServerOwnership(token ?? '', sid, newOwnerId);
      opts.onWorkspaceRefresh();
    } catch (e) {
      transferOwnershipError.value =
        e instanceof Error ? e.message : 'Transfer failed';
    } finally {
      transferOwnershipLoading.value = false;
    }
  }

  async function runDeleteServer() {
    const sid = opts.server.value?.id;
    if (!sid || !opts.deleteServerEnabled.value) return;
    deleteServerError.value = '';
    deleteServerLoading.value = true;
    try {
      const token = opts.accessToken.value;
      await deleteEchoServer(token ?? '', sid);
      opts.onServerDeleted(sid);
    } catch (e) {
      deleteServerError.value =
        e instanceof Error ? e.message : 'Could not delete server';
    } finally {
      deleteServerLoading.value = false;
    }
  }

  return {
    transferOwnershipLoading,
    transferOwnershipError,
    deleteServerLoading,
    deleteServerError,
    canTransferEchoOwnership,
    transferOwnershipCandidates,
    runTransferOwnership,
    runDeleteServer,
  };
}
